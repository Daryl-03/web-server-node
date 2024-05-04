import * as net from 'net';
import { exitCode } from 'process';

export type TCPConn = {
	socket: net.Socket;

	reader: null | {
		resolve: (data: Buffer) => void,
		reject: (err: Error) => void
	};

	ended: boolean;
	err: null | Error;
};

// promise based
export type TCPListener = {
	server: net.Server;
	port: number;
	host: undefined | string;

	connectionHandler: null | {
		resolve: (socket: net.Socket) => void,
		reject: (err: Error) => void
	};
	err: null | Error;
};

export type DynBuf = {
    data: Buffer,
    length: number,
	begin: number,
};

export type HTTPReq = {
	method: string,
	uri: Buffer,
	version: string,
	headers: Buffer[],	
}

export type HTTPRes = {
	code: number,
	headers: Buffer[],
	body: BodyReader,
}

export type BodyReader = {
	length: number,
	read: () => Promise<Buffer> 
} // 

export class HTTPError extends Error {
	code: number;
	
	constructor(code: number, message: string) {
		super(message);
		this.code = code;

		const actualProto = new.target.prototype;
		if(Object.setPrototypeOf){
			Object.setPrototypeOf(this, actualProto);
		} else {
			(this as any).__proto__ = actualProto;
		}
	}
}