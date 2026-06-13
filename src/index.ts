import { getType } from "./help.js"

type TorsArgs = {
    onStopLog: () => void
    maxCallStack?: number
    maxLogsLength?: number
    sendResultUrl?: string
}
type Log = {
    act: string
    find: string
    args: any
    time: number
    deep: number
    startFrame: number
    endFrame: number
    switchIndex?: number
}
type Log2 = {
    time: number
    startFrame: number
    endFrame: number
}
type State = Record<string, any> | any[] // {} or []; Conteiner for values;

function isObjOrArr(value: any): boolean {
    const t = getType(value)
    return t === 'object' || t === 'array'
}
// Create only once, singeton function;
export default ({
    onStopLog,
    maxCallStack = 2500,
    maxLogsLength = 5000,
    sendResultUrl = '',
}: TorsArgs) => {
    // main stack;
    const logs = [] as Log[]
    let deep = 0
    // callback stack;
    const logs2 = [] as Log2[]
    const deep2 = 0

    const getLog = ({ act = '', find = '', args = '' }): Log => {
        const log = {
            act,
            find,
            args,

            time: performance.now(),
            deep,
            startFrame: logs.length,
            endFrame: logs.length + 1,
            // memory: getMemory(),
        }
        logs.push(log)

        //console.log(logs.length - 1, act, find)
        if (logs.length > maxLogsLength) {
            throw new Error('FunctionsDetector ERROR: Max logs length exceeded:' + logs.length)
        }
        return log
    }
    function startMarkCallback(title = '⏰'):Log2 {
        getLog({
            act: 'fun',
            find: title,
        })
        const log2 = {
            time: performance.now(),
            startFrame: logs.length - 1,
            endFrame: logs.length,
            // memory: getMemory(),
        }
        logs2.push(log2)

        return log2;
    }
    function endMarkCallback(log2:Log2) {
        log2.endFrame = logs.length
        log2.time = performance.now() - log2.time
    }

    
    function getStateDetector(state:State, path:string) {
        // state - primitive strucutre tree

        // if state has [] or {}
        for (const key in state) {
            //@ts-ignore
            const value = state[key]
            if (getType(value) === 'function') {
                // TODO
                throw new Error(`${path}.${key}` + ' can not be "function"')
            }
            if (isObjOrArr(value)) {
                 //@ts-ignore
                state[key] = getStateDetector(value, `${path}.${key}`)
            }
        }

        return new Proxy(state, {
            get(target, prop, receiver) {
                const value = Reflect.get(target, prop, receiver)

                if (
                    Array.isArray(target) &&
                    typeof value === 'function' &&
                    ['push', 'pop', 'shift', 'unshift', 'splice'].includes(prop)
                ) {
                    return function (...args) {
                        return {
                            push: () => {
                                const start = target.length
                                const wrapped = args.map((a, i) =>
                                    isObjOrArr(a) ? getStateDetector(a, `${path}.${start + i}`) : a,
                                )
                                const res = Array.prototype.push.apply(target, wrapped)
                                getLog({
                                    act: 'push',
                                    find: path,
                                    args: JSON.parse(JSON.stringify(args)),
                                })
                                //logs.push({ act: 'push', find: path, args: JSON.parse(JSON.stringify(args) })
                                return res
                            },
                            pop: () => {
                                const oldLen = target.length
                                const res = Array.prototype.pop.apply(target)
                                // элемент удалён с индекса oldLen-1
                                //logs.push({ act: 'pop', find: path, args: [] })
                                getLog({ act: 'pop', find: path, args: '' })
                                return res
                            },
                            shift: () => {
                                const res = Array.prototype.shift.apply(target)
                                //logs.push({ act: 'shift', find: path, args: [] })
                                getLog({ act: 'shift', find: path, args: '' })
                                return res
                            },
                            unshift: () => {
                                // новые элементы встанут в [0..args.length-1]
                                const wrapped = args.map((a, i) =>
                                    isObjOrArr(a) ? getStateDetector(a, `${path}.${i}`) : a,
                                )
                                const res = Array.prototype.unshift.apply(target, wrapped)
                                //logs.push({ act: 'unshift', find: path, args: JSON.parse(JSON.stringify(args) })
                                getLog({
                                    act: 'unshift',
                                    find: path,
                                    args: JSON.parse(JSON.stringify(args)),
                                })
                                return res
                            },
                            splice: () => {
                                // use splice only with one or two argument, else throw error;
                                if (args.length > 2) {
                                    // TODO support full splice method (start, deleteCount, ...items)
                                    throw new Error('Use splice with one or two arguments.')
                                }

                                // splice(start, deleteCount?, ...items)
                                const start = args[0]
                                const deleteCount =
                                    args.length >= 2 ? args[1] : target.length - start

                                const items = args.slice(2)
                                const wrappedItems = items.map((a, i) =>
                                    isObjOrArr(a) ? getStateDetector(a, `${path}.${start + i}`) : a,
                                )

                                const res = Array.prototype.splice.apply(target, [
                                    start,
                                    deleteCount,
                                    ...wrappedItems,
                                ])

                                // формат args можно сделать как тебе удобнее.
                                // Сейчас: [start, deleteCount, ...items] — как у нативного splice
                                //logs.push({ act: 'splice', find: path, args: JSON.parse(JSON.stringify(args) })
                                getLog({
                                    act: 'splice',
                                    find: path,
                                    args: JSON.parse(JSON.stringify(args)),
                                })
                                return res
                            },
                        }[prop]()

                        // const result = value.apply(receiver, args) receiver is proxy, go to set
                        // return result;
                    }
                }
                return value
            },
            set(target, prop, value, receiver) {
                const find = `${path}.${prop}`
                const parentType = getType(target)
                const valueType = getType(value)
                //console.log('set::', { target, prop, value, receiver })

                if (valueType === 'function') {
                    // TODO
                    throw new Error(find + ' can not add "function"')
                }

                const parentIsObj = getType(target) === 'object'

                const isNew = !Object.prototype.hasOwnProperty.call(target, prop)
                const isPrimitive = [
                    'string',
                    'number',
                    'boolean',
                    'null',
                    'undefined',
                    'NaN',
                    'Infinity',
                ].includes(valueType)
                const index = bin3(parentIsObj, isNew, isPrimitive)
                    ;[
                        // []
                        // old
                        () => {
                            // {} or []
                            //console.log('[] set index = ( {} or [] )')
                            getLog({
                                act: 'setIndex',
                                find,
                                args: JSON.parse(JSON.stringify(value)),
                            })
                            value = getStateDetector(value, find)
                        },
                        () => {
                            // primitive
                            //console.log('[] set index, to primitive')
                            getLog({
                                act: 'setIndex',
                                find,
                                args: value,
                            })
                        },
                        // new
                        () => {
                            // {} or []
                            //console.log('[] new index = ( {} or [] )')
                            getLog({
                                act: 'addIndex',
                                find,
                                args: JSON.parse(JSON.stringify(value)),
                            })
                            value = getStateDetector(value, find)
                        },
                        () => {
                            // primitive
                            //console.log('[] new index = primitive')
                            getLog({
                                act: 'addIndex',
                                find,
                                args: value,
                            })
                        },

                        // {}
                        // old
                        () => {
                            // {} or []
                            //console.log('{} set key = ( {} or [] )')
                            getLog({
                                act: 'setKey',
                                find,
                                args: JSON.parse(JSON.stringify(value)),
                            })
                            value = getStateDetector(value, find)
                        },
                        () => {
                            // primitive
                            // console.log('{} set key, to primitive');
                            getLog({
                                act: 'setKey',
                                find,
                                args: value,
                            })
                        },
                        // new
                        () => {
                            // {} or []
                            //console.log('{} new key = ( {} or [] )')
                            getLog({
                                act: 'addKey',
                                find,
                                args: JSON.parse(JSON.stringify(value)),
                            })
                            value = getStateDetector(value, find)
                        },
                        () => {
                            // primitive
                            //console.log('{} new key = primitive')
                            getLog({
                                act: 'addKey',
                                find,
                                args: value,
                            })
                        },
                    ][index]()

                return Reflect.set(target, prop, value, receiver)
            },
            deleteProperty(target, prop) {
                //const find = `${path}.${prop}`
                // logs.push({
                //     act: 'dellKey',
                //     find: path,
                //     args: prop,
                // })
                getLog({
                    act: 'dellKey',
                    find: path,
                    args: prop,
                })
                return Reflect.deleteProperty(target, prop)
            },
        })
    }

    const getProxyFun = (fun, find) => {
        //console.log({namef:find})
        if (getType(fun) !== 'function') {
            throw new Error(`${find}  is not function. target type: ${getType(fun)}`)
        }
        return new Proxy(fun, {
            apply(target, thisArg, args) {
                //console.log('apply::', { target, thisArg, args })
                let log = getLog({
                    act: 'fun',
                    find: find,
                    args: getArgs(args),
                })
                if (++deep > maxCallStack) {
                    throw new Error('FunctionsDetector ERROR: Max deep level exceeded:' + deep)
                }
                try {
                    // Вызываем оригинальную функцию
                    const result = Reflect.apply(target, thisArg, args)
                    // we never get result if in infinite loop;
                    // so we can't show switchIndex;
                    // try use MarkSwitcher for this case;

                    if (target.name.startsWith('s_')) {
                        let index = result
                        if (getType(result) !== 'number') {
                            index = Number(Boolean(index))
                        }
                        log.switchIndex = index
                    }
                    return result
                } finally {
                    deep--
                    log.endFrame = logs.length
                }
            },
        })
    }
    function getFunctionsDetector(functions, path) {
        // functions = flat {} or [] with functions
        for (const key in functions) {
            const find = `${path}.${key}`
            functions[key] = getProxyFun(functions[key], find)
        }

        // when we add new function
        return new Proxy(functions, {
            set(target, prop, value, receiver) {
                const find = `${path}.${prop}`
                //console.log('fun set::', { target, prop, value, receiver })
                // TODO create log 'add new function'
                const proxyVal = getProxyFun(value, find)
                return Reflect.set(target, prop, proxyVal, receiver)
            },
        })
    }
    function enableLoggingForClassInstance(instance, igoneMethods = []) {
        let path = instance.constructor.name // class App = 'App'
        if (instance.scope) {
            path += `-${instance.scope}` // 'App-1' for copy
        }
        if (instance.parent && instance.parent.prcs) {
            path = instance.parent.find + '.prcs.' + path // 'Main.prcs.App-1'
        }
        instance.find = path

        if (instance.state && typeof instance.state === 'object') {
            instance.state = getStateDetector(instance.state, `${path}.state`)
        }

        if (instance.out && typeof instance.out === 'object') {
            instance.out = getFunctionsDetector(instance.out, `${path}.out`)
        }
        // if (instance.api && typeof instance.api === "object") {
        //   instance.api = getFunctionsDetector(instance.api, `${path}.api`);
        // }

        const proto = Object.getPrototypeOf(instance)
        const methodNames = Object.getOwnPropertyNames(proto).filter(
            (key) =>
                typeof proto[key] === 'function' &&
                key !== 'constructor' &&
                //key !== 'destroy' && // ignore destroy method
                !igoneMethods.includes(key),
        )
        for (let funName of methodNames) {
            const originalMethod = instance[funName]
            let key = funName
            if (key.startsWith('i_')) {
                key = 'inp.' + funName
            }
            instance[funName] = getProxyFun(originalMethod, `${path}.${key}`)
        }

        getLog({
            act: 'create',
            find: path,
            args: '',
        })
        // ovverride destroy method to log destroy action;
        // if(instance.destroy && typeof instance.destroy === 'function') {

        // }
    }

    function markFunction(instance, name, args = '') {
        if (!instance || typeof instance.find !== 'string') {
            console.error('Wrong instance argument, markFunction() with name:' + name)
            return
        }
        const path = instance.find + `.${name}`;
        const log = getLog({
            act: 'fun',
            find: path,
            args,
        })
        return log;
    }
    function markSwitcher(instance, name, switchIndex) {
        if (!instance) {
            console.error('Wrong instance argument, markSwitcher() with name:' + name)
            return
        }
        let value = switchIndex
        if (typeof switchIndex !== 'number') {
            value = Number(Boolean(switchIndex))
        }
        const log = markFunction(instance, name);
        log.switchIndex = value
    }


    function createLog(find, act = 'create', args = '') {
        getLog({
            act,
            find,
            args,
        })
    }
    // GLOBAL ERROR HANDLER
    if (typeof process !== 'undefined' && process.on) {
        // Node catch global error
        process.on('uncaughtException', (error:any) => {
            getLog({
                act: 'error',
                find: 'uncaughtException',
                args: error.message || error.toString(),
            })
            onStopLog()
            console.error('===> Uncaught Exception:', error)
        })
    } else {
        // window catch global error
        window.addEventListener('error', (event) => {
            getLog({
                act: 'error',
                find: 'windowError',
                args: event.message || event.toString(),
            })
            onStopLog()
            console.error('Window Error:', event)
        })
        window.addEventListener('unhandledrejection', (event) => {
            getLog({
                act: 'error',
                find: 'windowError',
                args: event.reason?.message || event.reason?.toString(),
            })
        })
    }
    return {
        logs,
        logs2,
        createLog,
        markFunction,
        markSwitcher,
        getFunctionsDetector,
        getStateDetector,
        enableLoggingForClassInstance,
        onStopLog,
        startMarkCallback,
        endMarkCallback,
    }
}