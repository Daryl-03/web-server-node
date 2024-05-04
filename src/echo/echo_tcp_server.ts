import * as net from 'net';
import { TCPConn } from './types';
import * as PromiseApi from './promise_based_api_tcp_server';

console.log("echo tcp server");
const port = 3320;
const host = '127.0.0.1';
// const server = net.createServer();


function newCon(soc: net.Socket) {
	console.log("new conn from ", soc.remoteAddress,":", soc.remotePort);
	
	soc.on("end", ()=>{
		console.log("connection closed");
	})

	soc.on("data", (data)=>{
		console.log(soc.remoteAddress+':'+soc.remotePort, "sent : "+data);
		if(data.includes('q')){
			soc.end(()=>{
				console.log("connection closed");
			});
		} else {
			soc.write(data);
		}
	})
};


// server.on("connection", PromiseApi.newConn);

// server.on("error", (soc)=> {
// 	console.log(soc.message);
// });


// server.listen(port, host, ()=>{
	
// 	console.log("listening on", host+':'+port);
// });

PromiseApi.echoTcpServer(port, host);