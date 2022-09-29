import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

export interface Settings<S> {
  schema?: SchemaList<S>
}

export interface Schema<T, IdType> {
  new: (p?: Partial<T>) => { readonly $id: IdType } & Partial<T>
  update: (r: Partial<T>) => void
}

export type SchemaList<Type> = {
  [Property in keyof Type]: Type[Property] extends z.AnyZodObject ? Type[Property] : never
}

const makeSchema = <S extends Record<string, unknown>>(settings: Settings<S>) => {
  type InferZodTypes<Type> = {
    [Property in keyof Type]: Type[Property] extends z.AnyZodObject ? z.infer<Type[Property]> : never
  }

  type ZodTypes = InferZodTypes<typeof settings.schema>

  // Might want to make this configurable...
  type IdType = string

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type SchemaMap<Type> = {
    [Property in keyof Type as Type[Property] extends never ? never : Property]: Property extends keyof ZodTypes ? Schema<ZodTypes[Property], IdType> : never
  }

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type ZodMap<Type> = {
    [Property in keyof Type as Type[Property] extends never ? never : Property]: Property extends keyof ZodTypes ? ZodTypes[Property] : never
  }

  return Object.keys(settings.schema || {})
    .map((name: keyof S) => {
      const zod = settings.schema[name]

      // Runtime equivalent of filtering out non inferred zod keys
      if (!(zod instanceof z.ZodObject)) {
        return false
      }

      type Z = typeof zod extends z.AnyZodObject ? z.infer<typeof zod> : never

      const schema: Schema<Z, IdType> = {
        new: (p) => {
          return { ...(p || {}), $id: uuidv4() }
        },

        update: (r) => {},
      }

      return { name, schema, zod }
    })
    .reduce(
      (container, current) => {
        if (!current) return container

        container.schema[current.name as keyof typeof container.schema] = current.schema as typeof container.schema[keyof typeof container.schema]

        container.zod[current.name as keyof typeof container.zod] = current.zod as typeof container.zod[keyof typeof container.zod]

        return container
      },
      { schema: {}, zod: {} } as { schema: SchemaMap<ZodTypes>; zod: ZodMap<ZodTypes> }
    )
}

export const makeMemoryDB = <S extends {}>(settings: Settings<S> = {}) => {
  const { schema, zod } = makeSchema(settings)

  return {
    zod,
    schema,
  }
}

export default makeMemoryDB
