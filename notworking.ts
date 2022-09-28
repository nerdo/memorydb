
import { z } from 'zod'

export type SchemaList<Type> = {
  [Property in keyof Type]: z.ZodType
}

export interface Settings<S extends Record<string, z.ZodType>> {
  schema?: SchemaList<S>
}

export interface Schema<T> {
  new: () => { readonly $id: number } & Partial<T>
}

export type UnwrapInferred<Type> = {
  [Property in keyof Type]: Type[Property] extends z.ZodType ? z.infer<Type[Property]> : Type[Property]
}

export type UnwrapSchemaList<Type> = Type extends SchemaList<infer R> ? R : never

const makeSchema = <S extends Record<string, z.ZodType>>(settings: Settings<S>) => {
  type U = UnwrapInferred<typeof settings.schema>
  type V = U[keyof U]
  // const u: U

  return Object.keys(settings.schema || {})
    .map((name: keyof S) => {
      const zod = settings.schema[name]

      const schema: Schema<z.infer<typeof zod>> = {
        new: () => {
          return { $id: 1 } as { readonly $id: number }
        },
      }

      return { name, schema }
    })
    .reduce((container, current) => {
      container[current.name] = current.schema
      return container
    }, {} as Record<keyof S, Schema<typeof settings.schema>>)
}

export const makeMemoryDB = <S extends Record<string, z.ZodType>>(settings: Settings<S> = {}) => {
  const { schema: zod } = settings

  const schema = makeSchema(settings)

  return {
    zod,
    schema,
  }
}

export default makeMemoryDB
