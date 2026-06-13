type Bin2 = 0 | 1 | 2 | 3;
type Bin3 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

//@ts-ignore
export const bin2 = (a: any, b: any): Bin2 => (a << 1) | b
//@ts-ignore
export const bin3 = (a:any, b:any, c:any):Bin3 => (a << 2) | (b << 1) | c

export function getType(obj: any): string {
    const type: string = typeof obj
    if (type === 'object') {
        if (obj === null) return 'null'
        if (Array.isArray(obj)) return 'array'
        if (obj instanceof RegExp) return 'regexp'
        if(obj instanceof Date) return 'date'
    } else if (type === 'number') {
        if (obj === Infinity || obj === -Infinity) return 'Infinity'
        if (Number.isNaN(obj)) return 'NaN'
    }
    return type
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
export function randomId(length = 6):string {
    return letters[Math.floor(Math.random() * letters.length)] +
    Math.random().toString(36).substring(2, length - 1)
}