import { z } from 'zod'

export interface Settings<S> {
  schema?: SchemaList<S>
}

export interface Schema<T> {
  new: () => { readonly $id: number } & Partial<T>
  update: (r: Partial<T>) => void
}

export type SchemaList<Type> = {
  [Property in keyof Type]: Type[Property] extends z.ZodTypeAny ? Type[Property] : never
}

const makeSchema = <S extends Record<string, unknown>>(settings: Settings<S>) => {
  type UnwrapInferred<Type> = {
    [Property in keyof Type]: Type[Property] extends z.ZodType ? z.infer<Type[Property]> : Type[Property]
  }
  type U = UnwrapInferred<typeof settings.schema>

  type SchemaMap<Type> = {
    [Property in keyof Type]: Property extends keyof U ? Schema<U[Property]> : never
  }

    .map((name: keyof S) => {
      const zod = settings.schema[name]

      type Z = z.infer<typeof zod>

      const schema: Schema<Z> = {
        new: () => {
          return { $id: 1 }
        },

        update: (r) => {
        }
      }

      return { name, schema }
    })
    .reduce((container, current) => {
      container[current.name] = current.schema as keyof S extends keyof S ? Schema<UnwrapInferred<SchemaList<S>>[keyof S]> : never
      return container
    }, {} as SchemaMap<U>)
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
