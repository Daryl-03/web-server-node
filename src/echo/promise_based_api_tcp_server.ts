import * as net from "net";
import { TCPConn, TCPListener } from "./types";
import { customLog } from "../utils";

function soInit(socket: net.Socket): TCPConn {
	const conn: TCPConn = {
		socket: socket,
		reader: null,
		err: null,
		ended: false,
	};
	socket.on("data", (data: Buffer) => {
		console.assert(conn.reader); // there must be a reader. if not, the data is lost.
		// pause the 'data' event until the next read.
		conn.socket.pause();
		// fulfill the promise of the current read.
		conn.reader!.resolve(data);
		conn.reader = null;
	});

	socket.on("end", () => {
		conn.ended = true;
		socket.end();
		if (conn.reader) {
			conn.reader.resolve(Buffer.from(""));
			conn.reader = null;
		}
	});

	socket.on("error", (err) => {
		conn.err = err;
		if (conn.reader) {
			conn.reader.reject(err);
			conn.reader = null;
		}
	});
	

	return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
	console.assert(!conn.reader);
	customLog(`reading from socket ${conn.socket.remoteAddress}:${conn.socket.remotePort}`, 0);
	return new Promise((resolve, reject) => {
		if (conn.err) {
			reject(conn.err);
			return;
		}

		if (conn.ended) {
			resolve(Buffer.from(""));
			return;
		}

		// save the promise callbacks
		conn.reader = { resolve: resolve, reject: reject };
		// and resume the 'data' event to fulfill the promise later.
		conn.socket.resume();
	});
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
	console.assert(data.length > 0);
	return new Promise((resolve, reject) => {
		if (conn.err) {
			reject(conn.err);
			return;
		}

		conn.socket.write(data, (err?: Error) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

async function newConn(socket: net.Socket): Promise<void> {
	console.log("new connection", socket.remoteAddress, socket.remotePort);
	try {
		await serveClient(socket);
	} catch (exc) {
		console.error("exception:", exc);
	} finally {
		socket.destroy();
	}
}

async function newConnTCP(socket: net.Socket): Promise<void> {
	console.log("new connection", socket.remoteAddress, socket.remotePort);
	try {
		await serveClient(socket);
	} catch (exc) {
		console.error("exception:", exc);
	} finally {
		socket.destroy();
	}
}

async function serveClient(socket: net.Socket): Promise<void> {
	const conn: TCPConn = soInit(socket);
	while (true) {
		const data = await soRead(conn);
		if (data.length === 0) {
			console.log("end connection");
			break;
		}

		console.log("data", data.toString());
		await soWrite(conn, data);
	}
}

function soListen(port: number, host?: string): TCPListener {
	const listener: TCPListener = {
		server: net.createServer(),
		port: port,
		host: host || undefined,
		connectionHandler: null,
		err: null,
	};

	// listener.server.listen(port, host, () => {
	// 	listener.listening = true;
	// 	console.log('listening on', host + ':' + port);
	// });

	listener.server.on("connection", (socket) => {
		console.assert(listener.connectionHandler);
		// console.log('new connection from', socket.remoteAddress, socket.remotePort);
		listener.server.close();
		listener.connectionHandler!.resolve(socket);
		listener.connectionHandler = null;
	});

	listener.server.on("error", (err) => {
		listener.err = err;
		if (listener.connectionHandler) {
			listener.connectionHandler.reject(err);
			listener.connectionHandler = null;
		}
		console.log("error:", err);
	});

	return listener;
}

function soAccept(listener: TCPListener): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		if (listener.err) {
			reject(listener.err);
			return;
		}

		if (listener.connectionHandler) {
			reject(new Error("another accept is pending"));
			return;
		}

		listener.connectionHandler = { resolve: resolve, reject: reject };
		listener.server.listen(listener.port, listener.host, () => {
			console.log("listening on", listener.host + ":" + listener.port);
		});
	});
}

async function echoTcpServer(port: number, host?: string) {
	const listener = soListen(port, host || "127.0.0.1");
	let running = true;

	while (running) {
		try {
			const conn = await soAccept(listener);
			// console.log("await",conn);

			if (conn) {
				// console.log(conn);

				newConn(conn);
			}
		} catch (exc) {
			console.error("exception:", exc);
		}
	}
}

export {
	newConn,
	serveClient,
	soInit,
	soRead,
	soWrite,
	soListen,
	soAccept,
	echoTcpServer,
};
