type SingletonFunction<T> = (...args: any[]) => T

const createSingleton = <T>(functionToInstantiate: SingletonFunction<T>): SingletonFunction<T> => {
  let instance: T

  const getInstance: SingletonFunction<T> = (...args) => {
    if (!instance) {
      instance = functionToInstantiate(...args)
    }

    return instance
  }

  return getInstance
}

export default createSingleton