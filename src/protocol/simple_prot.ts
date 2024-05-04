import {soInit, soRead, soWrite, soListen, soAccept} from '../echo/promise_based_api_tcp_server';
import * as net from 'net';
import { DynBuf } from '../echo/types';
import { bufPush } from './dynamicBuffer';
import { log } from 'console';


async function simpleProtServer(port: number, host: string): Promise<void> {
	const listener = soListen(port, host);
	
	while (true) {
		try {
			const socket = await soAccept(listener);
			if (socket) {
				console.log("new connection from", socket.remoteAddress, socket.remotePort);
				
				serveClient(socket);
			}
		} catch (err) {
			console.log("error:", err);
		}
	}
}

async function serveClient(socket: net.Socket): Promise<void> {
	const conn = soInit(socket);
	const buf : DynBuf = {
		data: Buffer.alloc(0),
		length: 0,
		begin: 0,
	};

	while (true) {
		const msg = cutMessage(buf);
		if(!msg){
			const data : Buffer = await soRead(conn);
			if (data.length === 0) {
				console.log("end connection");
				break;
			}
			bufPush(buf, data);
			continue;
		}

		if(msg.equals(Buffer.from("quit\n"))){
			console.log("quiting...");
			await soWrite(conn, Buffer.from("bye\n"));
			socket.destroy();
		} else {
			console.log("data", msg.toString());
			await soWrite(conn, Buffer.concat([Buffer.from("echo : "), msg, Buffer.from("\n")]));

		}
	}
}

function cutMessage(buf: DynBuf): Buffer | null {
	const newline = Buffer.from('\n');
	const lastIndexInclude = buf.begin + buf.length;
	const idx = buf.data.subarray(buf.begin, lastIndexInclude).indexOf(newline);

	if (idx < 0) {
		return null;
	}
	const msg = Buffer.from(buf.data.subarray(buf.begin, idx + buf.begin+1));
	
	bufPop(buf, idx + 1);

	return msg;
}

function bufPop(buf: DynBuf, count: number): void {

	buf.begin += count;
	if(buf.begin > buf.data.length/2){
		buf.data.copyWithin(0, count, buf.length);
		buf.begin = 0;
	}
	buf.length -= count;
}

export { simpleProtServer };