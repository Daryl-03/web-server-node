import { DynBuf } from "../echo/types";

export function bufPush(buf: DynBuf, data: Buffer): void {
    const newLen = buf.length + data.length;
    if (buf.data.length - buf.begin < newLen) { // minus begin to compute the remaining space
        let cap = Math.max(buf.data.length, 32);
		while (cap < newLen) {
			cap *= 2;
		}
		const newData = Buffer.alloc(cap);
		buf.data.copy(newData, 0, 0);
		buf.data = newData;
    }
    data.copy(buf.data, buf.length + buf.begin, 0);
    buf.length = newLen;
}

export function bufPop(buf: DynBuf, count: number): void {
	buf.begin += count;
	if (buf.begin > buf.data.length / 2) {
		// console.log("copyWithin");
		// console.log("buf.data before copy", buf.data.toString());
		// console.log("buf.begin", buf.begin);
		// console.log("first char : ", buf.data[buf.begin].toString());
		// console.log("buf.length", buf.length);
		
		buf.data.copyWithin(0, buf.begin, buf.begin + buf.length);
		buf.data.fill(0, buf.length, buf.length + buf.begin);
		buf.begin = 0;
		// console.log("buf.data after copy", buf.data.toString());
	}
	buf.length -= count;
}