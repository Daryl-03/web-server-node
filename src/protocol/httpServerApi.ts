/**
 * This file contains the implementation of an HTTP server API.
 * It provides functions for starting an HTTP server, handling client connections,
 * parsing HTTP requests, and writing HTTP responses.
 * 
 * @module httpServerApi
 */
import { parse } from "path";
import { soAccept, soInit, soListen, soRead, soWrite } from "../echo/promise_based_api_tcp_server";
import {
	BodyReader,
	DynBuf,
	HTTPReq,
	HTTPRes,
	TCPConn,
	HTTPError,
} from "../echo/types";
import { bufPush, bufPop } from "./dynamicBuffer";
import net from "net";
import { customLog, LogLevel } from "../utils";

const kMaxHeaderLen = 1024 * 8; // max header length in http request is 8KB
const kHttpMethods = [
	"GET",
	"POST",
	"PUT",
	"DELETE",
	"HEAD",
	"OPTIONS",
	"TRACE",
	"CONNECT",
];
const kReasons: { [key: number]: string } = {
	100: "Continue",
	101: "Switching Protocols",
	200: "OK",
	201: "Created",
	202: "Accepted",
	203: "Non-Authoritative Information",
	204: "No Content",
	205: "Reset Content",
	206: "Partial Content",
	300: "Multiple Choices",
	301: "Moved Permanently",
	302: "Found",
	303: "See Other",
	304: "Not Modified",
	305: "Use Proxy",
	307: "Temporary Redirect",
	308: "Permanent Redirect",
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Payload Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	418: "I'm a teapot", // Easter egg status code from Hyper Text Coffee Pot Control Protocol
	421: "Misdirected Request",
	422: "Unprocessable Entity",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	451: "Unavailable For Legal Reasons",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	506: "Variant Also Negotiates",
	507: "Insufficient Storage",
	508: "Loop Detected",
	510: "Not Extended",
	511: "Network Authentication Required",
};


/**
 * Starts an HTTP server that listens for incoming connections on the specified port and host.
 * @param port - The port number to listen on.
 * @param host - The host address to bind the server to.
 */
export async function httpServer(port:number, host:string) {
	const listener = soListen(port, host);
	
	while (true) {
		try {
			const socket = await soAccept(listener);
			if (socket) {
				// console.log("new connection from", socket.remoteAddress, socket.remotePort);
				customLog(`new connection from ${socket.remoteAddress} ${socket.remotePort}`);
				
				newConn(socket);
			}
		} catch (err) {
			console.log("error:", err);
			customLog(`error: ${err}`, LogLevel.ERROR);
		}
	}
}

/**
 * Handles a new connection from a client socket.
 * 
 * @param socket - The client socket object.
 */
async function newConn(socket: net.Socket) {
	const conn = soInit(socket);

	try {
		await serveClient(conn);
	} catch (error) {
		customLog(`error: ${error}`, LogLevel.ERROR);
		if (error instanceof HTTPError) {
			const res: HTTPRes = {
				code: error.code,
				headers: [],
				body: readerFromMemory(Buffer.from(error.message + "\n")),
			};
			try {
				await writeHTTPRes(conn, res);
			} catch (error) {
				console.error("error:", error);
				customLog(`error: ${error}`, LogLevel.ERROR);
			}
		}
	} finally {
		socket.destroy();
		customLog(` connection from ${socket.remoteAddress} ${socket.remotePort} closed`);
	}
}

/**
 * Serves a client connection by processing incoming HTTP requests and sending back responses.
 * 
 * @param conn - The TCP connection object representing the client connection.
 * @returns A Promise that resolves when the client connection is closed.
 */
async function serveClient(conn: TCPConn): Promise<void> {
	const buf: DynBuf = {
		data: Buffer.alloc(0),
		length: 0,
		begin: 0,
	};

	while (true) {
		const msg: HTTPReq | null = cutMessage(buf);

		if (!msg) {
			// console.log("no message yet");
			const data: Buffer = await soRead(conn);
			bufPush(buf, data);
			if (data.length === 0 && buf.length === 0) {
				customLog(`end connection from ${conn.socket.remoteAddress}:${conn.socket.remotePort}`);
				return;
			}

			if (data.length === 0) {
				//error
				customLog(`Unexpected EOF from ${conn.socket.remoteAddress}:${conn.socket.remotePort}`, LogLevel.ERROR);
				throw new HTTPError(400, "Unexpected EOF.");
			}
			
			// console.log("data", data.toString());
			continue;
		}

		customLog(`got ${msg.method} request for ${msg.uri.toString()} from ${conn.socket.remoteAddress}:${conn.socket.remotePort}`);
		
		const reqBody: BodyReader = readerFromReq(conn, buf, msg);
		const res: HTTPRes = await handleReq(msg, reqBody);

		await writeHTTPRes(conn, res);

		//closing the connection for HTTP 1.0
		if (msg.version === "1.0") {
			return;
		}

		while ((await reqBody.read()).length > 0) {
			//discard the rest of the body
		}

		console.log("\n\nafter handle req : ", buf.data.toString(), "\n\n");
		console.log("\n\nafter handle req bin : ", buf.data, "\n\n");
	}
}


/**
 * Cuts the message from the given buffer and returns an HTTPReq object.
 * If the buffer does not contain a complete message, returns null.
 * Throws an HTTPError if the header length exceeds the maximum allowed length.
 *
 * @param buf - The buffer containing the message.
 * @returns The parsed HTTPReq object or null if the message is incomplete.
 * @throws HTTPError if the header length exceeds the maximum allowed length.
 */
function cutMessage(buf: DynBuf): HTTPReq | null {
	const newline = Buffer.from("\r\n\r\n");
	const lastIndexInclude = buf.begin + buf.length;
	const idx = buf.data.subarray(buf.begin, lastIndexInclude).indexOf(newline);

	if (idx < 0) {
		
		if (buf.length > kMaxHeaderLen) {
			throw new HTTPError(413, "Header too long");
		}
		return null;
	}
	
	console.log("msg : ", Buffer.from(buf.data.subarray(buf.begin, idx + buf.begin + 4)).toString());
	console.log("\n\n the dynbuf :", buf.data.toString() ,"\n\n");
	const msg = parseHTTPReq(Buffer.from(buf.data.subarray(buf.begin, idx + buf.begin + 4)));
	bufPop(buf, idx + 4);

	return msg;
}

/**
 * Parses the HTTP request from the given data buffer.
 * 
 * @param data - The buffer containing the HTTP request data.
 * @returns An object representing the parsed HTTP request.
 * @throws {HTTPError} If the request contains a bad header.
 */
function parseHTTPReq(data: Buffer): HTTPReq {
	
	const lines: Buffer[] = splitlines(data);
	const [method, uri, version] = parseRequestLine(lines[0]);

	const headers: Buffer[] = [];
	for (let i = 1; i < lines.length - 1; i++) {
		const h = Buffer.from(lines[i]);
		if (!validateHeader(h)) {
			throw new HTTPError(400, "Bad header");
		}
		headers.push(h);
	}
	
	console.assert(lines[lines.length - 1].length === 0);

	return {
		method: method,
		uri: uri,
		version: version,
		headers: headers,
	};
}

/**
 * Splits a buffer into an array of buffers based on the separator "\r\n".
 * 
 * @param data - The buffer to be split.
 * @returns An array of buffers representing the lines.
 */
function splitlines(data: Buffer): Buffer[] {
	let lines: Buffer[] = [];
	let idx = 0;
	let begin = 0;
	const separator = Buffer.from("\r\n");
	while (begin < data.length) {
		idx = data.indexOf(separator, begin);
	
		if (idx < 0) {
			lines.push(Buffer.from(data.subarray(begin)));
			break;
		}
		if(idx != 0){
			lines.push(Buffer.from(data.subarray(begin, idx)));
		}
		begin = idx + 2;
	}
	return lines;
}

/**
 * Parses the request line of an HTTP request.
 * 
 * @param arg0 - The buffer containing the request line.
 * @returns An array containing the method, URI, and HTTP version extracted from the request line.
 * @throws {HTTPError} If the request line is malformed or contains invalid values.
 */
function parseRequestLine(arg0: Buffer): [string, Buffer, string] {
	let elements = arg0.toString().split(" ");
	console.log("elements for req : ", elements);
	// as per the HTTP request line format, it should have 3 elements
	if (elements.length !== 3) {
		throw new HTTPError(400, "Bad request line");
	}

	const method = elements[0];
	// check if the method is valid
	if (!kHttpMethods.includes(method)) {
		customLog(`Method ${method} not allowed`, LogLevel.ERROR);
		throw new HTTPError(405, "Method not allowed");
	}

	const uri = Buffer.from(elements[1]);
	// check if the uri is valid
	if (!validateURI(uri, method)) {
		throw new HTTPError(400, "Bad URI");
	}

	const version = elements[2].split("/")[1];
	// check if the version is valid
	if (version !== "1.0" && version !== "1.1") {
		throw new HTTPError(505, "HTTP version not supported");
	}

	return [method, uri, version];
}

/**
 * Validates a header buffer.
 * @param h - The header buffer to validate.
 * @returns A boolean indicating whether the header is valid or not.
 */
function validateHeader(h: Buffer): boolean {
	// console.log("validating header");
	// check if the header is valid
	if (h.length === 0 || !h.includes(Buffer.from(":"))) {
		// console.log(`header ${h.toString()} is invalid`);
		return false;
	}
	// console.log(`header ${h.toString()} is valid after first check`);
	let elements = h.toString().split(":", 2);
	// console.log(`header ${h.toString()} is valid after split with length ${elements.length}`);
	if (
		elements.length !== 2 ||
		elements[0].length === 0 ||
		elements[1].length === 0 ||
		elements[0].endsWith(" ")
	) {
		return false;
	}
	// console.log(`header ${h.toString()} is valid`);
	return true;
}

function readerFromMemory(arg0: Buffer): BodyReader {
	let done = false;
	return {
		length: arg0.length,
		read: async (): Promise<Buffer> => {
			if (done) {
				return Buffer.from("");
			}
			done = true;
			return arg0;
		},
	};
}

/**
 * Writes an HTTP response to the given TCP connection.
 * @param conn - The TCP connection to write the response to.
 * @param res - The HTTP response to write.
 * @throws {Error} - If the response body is empty.
 */
async function writeHTTPRes(conn: TCPConn, res: HTTPRes) {
	if (res.body.length < 0) {
		throw new Error("not implemented");
	}

	// set the content length
	res.headers.push(Buffer.from(`Content-Length: ${res.body.length}`));

	// write the header
	await soWrite(conn, encodeHTTPRes(res));

	// write the body
	while (true) {
		const data = await res.body.read();
		if (data.length === 0) {
			break;
		}
		// console.log("writing data : ", data.toString(), " to ", conn.socket.remoteAddress, conn.socket.remotePort);
		await soWrite(conn, data);
	}
}

function getReasonFromCode(code: number): string {
	return kReasons[code] || "Unknown";
}

function encodeHTTPRes(res: HTTPRes): Buffer {
	const statusLine = `HTTP/1.1 ${res.code} ${getReasonFromCode(
		res.code
	)}\r\n`;
	const headers =
		res.headers.map((header) => header.toString()).join("\r\n") +
		"\r\n\r\n";
	// const body = res.body;

	return Buffer.concat([Buffer.from(statusLine), Buffer.from(headers)]);
}


/**
 * Creates a `BodyReader` based on the provided connection, buffer, and request.
 *
 * @param conn - The TCP connection.
 * @param buf - The buffer.
 * @param req - The HTTP request.
 * @returns A `BodyReader` object.
 * @throws {HTTPError} If the Content-Length header is invalid or if the request method does not allow a body.
 * @throws {Error} If the transfer encoding is not supported or if the function is not implemented.
 */
function readerFromReq(conn: TCPConn, buf: DynBuf, req: HTTPReq): BodyReader {
	let bodyLen = -1;

	const contentLength = getField(req.headers, "Content-Length");
	if (contentLength) {
		bodyLen = parseDec(contentLength.toString("latin1")); // latin1 is used to convert the buffer to string.
		if (isNaN(bodyLen)) {
			throw new HTTPError(400, "Bad Content-Length");
		}
	}
	const bodyAllowed = !(req.method === "GET" || req.method === "HEAD");
	const chunked =
		getField(req.headers, "Transfer-Encoding")?.equals(
			Buffer.from("chunked")
		) || false;

	if (!bodyAllowed && (bodyLen > 0 || chunked)) {
		// console.log("body not allowed");
		throw new HTTPError(400, "Body not allowed");
	}

	if (!bodyAllowed) {
		bodyLen = 0;
	}

	if (chunked) {
		return readerFromChunked(conn, buf);
	} else if (bodyLen >= 0) {
		return readerFromConnLength(conn, buf, bodyLen);
	} else {
		throw new Error("Not implemented");
	}
}

/**
 * Handles the incoming HTTP request and returns the corresponding HTTP response.
 * @param req - The HTTP request object.
 * @param reqBody - The body of the HTTP request.
 * @returns A promise that resolves to the HTTP response object.
 */
async function handleReq(req: HTTPReq, reqBody: BodyReader): Promise<HTTPRes> {
	let resp: BodyReader;

	switch (req.uri.toString("latin1")) {
		case "/echo":
			resp = reqBody;
			break;

		default:
			resp = readerFromMemory(Buffer.from("Hello From Nazarick\n"));
			break;
	}

	return {
		code: 200,
		headers: [Buffer.from("Server: Nazarick")],
		body: resp,
	};
}

/**
 * Validates the URI based on the given method.
 * @param uri - The URI to validate as a Buffer.
 * @param method - The HTTP method used for validation.
 * @returns A boolean indicating whether the URI is valid or not.
 */
function validateURI(uri: Buffer, method: string): boolean {
	// check if the uri is valid
	if (uri.length === 0 || uri.includes(Buffer.from(" "))) {
		return false;
	}
	if (method === "CONNECT" && !uri.includes(Buffer.from(":"))) {
		return false;
	}
	if (method === "OPTIONS" && uri.length !== 1) {
		return false;
	}
	return true;
}

/**
 * Retrieves the value of a specific field from an array of headers.
 * @param headers - The array of headers.
 * @param key - The key of the field to retrieve.
 * @returns The value of the field as a Buffer, or null if the field is not found.
 */
function getField(headers: Buffer[], key: string): Buffer | null {
	for (const h of headers) {
		const [k, v] = h.toString().split(":");
		if (k.toLowerCase() === key.toLowerCase()) {
			customLog(`Field "${key}" found in headers`, LogLevel.INFO);
			return Buffer.from(v);
		}
	}
	customLog(`Field "${key}" not found in headers`, LogLevel.WARN);
	return null;
}

function parseDec(arg0: string): number {
	return parseInt(arg0, 10) || NaN;
}
/**
 * Creates a `BodyReader` object that reads a chunked body from a TCP connection.
 * @param conn The TCP connection to read from.
 * @param buf The buffer to store the read data.
 * @returns A `BodyReader` object with a `read` method that reads the chunked body.
 */
function readerFromChunked(conn: TCPConn, buf: DynBuf): BodyReader {
	// let chunks: Buffer[] = [];
	// let chunkSize: number | null = null;
	// let remainingSize: number | null = null;
	// let isLastChunk = false;

	// async function read(): Promise<Buffer> {
	// 	if (chunks.length > 0) {
	// 		return chunks.shift()!;
	// 	}

	// 	while (true) {
	// 		if (chunkSize === null) {
	// 			const line = await readLine();
	// 			chunkSize = parseInt(line.toString(), 16);
	// 			if (isNaN(chunkSize)) {
	// 				throw new HTTPError(400, "Invalid chunk size");
	// 			}
	// 			if (chunkSize === 0) {
	// 				isLastChunk = true;
	// 				break;
	// 			}
	// 		}

	// 		if (remainingSize === null) {
	// 			remainingSize = chunkSize;
	// 		}

	// 		const data = await soRead(conn);
	// 		bufPush(buf, data);

	// 		const availableData = Math.min(buf.length, remainingSize);
	// 		const chunk = buf.data.subarray(buf.begin, buf.begin + availableData);
	// 		bufPop(buf, availableData);

	// 		chunks.push(chunk);
	// 		remainingSize -= availableData;

	// 		if (remainingSize === 0) {
	// 			chunkSize = null;
	// 			remainingSize = null;
	// 		}
	// 	}

	// 	if (isLastChunk) {
	// 		return Buffer.concat(chunks);
	// 	}

	// 	throw new HTTPError(400, "Unexpected end of chunked body");
	// }

	// return { read };
	throw new Error("Function not implemented.");
}

function readerFromConnLength(
	conn: TCPConn,
	buf: DynBuf,
	bodyLen: number
): BodyReader {
	return {
		length: bodyLen,
		read: async (): Promise<Buffer> => {
			if (bodyLen === 0) {
				return Buffer.from("");
			}

			if (buf.length === 0) {
				const data = await soRead(conn);
				bufPush(buf, data);

				if (data.length === 0) {
					throw new HTTPError(400, "Unexpected EOF");
				}
			}

			const availableData = Math.min(buf.length, bodyLen);
			bodyLen -= availableData;
			const body = Buffer.from(
				buf.data.subarray(buf.begin, buf.begin + availableData)
			);
			bufPop(buf, availableData);

			return body;
		},
	};
}
