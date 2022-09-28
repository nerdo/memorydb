import { z } from 'zod'

export interface Settings<S> {
  schema?: SchemaList<S>
}

export interface Schema<T> {
  new: () => { readonly $id: number } & Partial<T>
}

export type SchemaList<Type> = {
  [Property in keyof Type]: Type[Property] extends z.ZodTypeAny ? Type[Property] : never
}

const makeSchema = <S extends Record<string, unknown>>(settings: Settings<S>) => {
  type UnwrapInferred<Type> = {
    [Property in keyof Type]: Type[Property] extends z.ZodType ? z.infer<Type[Property]> : Type[Property]
  }
  type U = UnwrapInferred<typeof settings.schema>

  return Object.keys(settings.schema)
    .map((name: keyof S) => {
      const zod = settings.schema[name]
      const schema: Schema<z.infer<typeof zod>> = {
        new: () => ({ $id: 1 }),
      }

      return { name, schema }
    })
    .reduce((container, current) => {
      container[current.name] = current.schema
      return container
    }, {} as Record<keyof S, Schema<U[keyof U]>>)
}

export const makeMemoryDB = <S extends {}>(settings: Settings<S> = {}) => {
  const { schema: zod } = settings

  const schema = makeSchema(settings)

  return {
    zod,
    schema,
  }
}

export default makeMemoryDB
