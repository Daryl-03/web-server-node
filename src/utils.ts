import * as fs from 'fs';

const logFile = 'logs/log.txt';

export enum LogLevel {
	INFO,
	WARN,
	ERROR,
}

export function customLog(msg: string, level: LogLevel = LogLevel.INFO): void{
	try {
		if(!fs.existsSync('logs')){
			fs.mkdirSync('logs');
		}
		fs.appendFileSync(logFile, `${new Date().toISOString()} ${LogLevel[level]}: ${msg}\n`);
	} catch (error) {
		console.error(error);
	}
}