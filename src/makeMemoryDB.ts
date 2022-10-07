import { z } from 'zod'
import { clone } from '@nerdo/utils'
import { v4 as uuidv4 } from 'uuid'

type InputSchemaDefinitions<Type> = {
  [P in keyof Type]: Type[P] extends z.AnyZodObject ? Type[P] : never
}

/**
 * Settings governing the shape and initialization of the DB.
 *
 * @typeParam S - the shape of the schema
 */
export interface Settings<S extends Record<string, unknown>> {
  /**
   * The schema definitions.
   */
  schema?: InputSchemaDefinitions<S>

  /**
   * A seeder callback function for the sake of priming the DB.
   */
  seeder?: (db: ReturnType<typeof makeSchema<S>>) => void
}

export type IdType = string

export type Identifiable = { readonly $id: IdType }

export type StoredModel<T extends {}> = Identifiable & T

export type StoredModelUpdate<T extends {}> = Identifiable & Partial<T>

/**
 * Context for the find operation's matcher and stopper.
 *
 * @remarks
 * The find operation loops through the collection of models,
 * calling "matcher" and "stopper" callback functions in each iteration
 * to know whether the model is a match that should be returned in the results,
 * and to decide to whether or not to continue searching for matches.
 *
 * In order to support various unknown algorithms for performing this filter,
 * this context object is provided to both functions to guide their logic.
 *
 * @typeParam Result - the shape of each result.
 * @typeParam Extra - the shape of the extra (custom) context object
 */
export interface FindFunctionContext<Result, Extra extends {}> {
  /**
   * The results of the find operation so far.
   */
  readonly results: Result[]

  /**
   * The current index in the collection of models.
   */
  index: number

  /**
   * The total number of models in the collection.
   */
  count: number

  /**
   * The options influencing the behavior of the current find operation.
   */
  readonly options?: FindFunctionOptions<Extra>

  /**
   * Extra (custom) context available in the find operation.
   *
   * @see {@link FindFunctionOptions<Extra>['extra']} for details.
   */
  extra: Extra
}

/**
 * Options influencing the behavior of the find operation.
 *
 * @typeParam Extra - the shape of the `extra` object used to initialize the find context.
 */
export interface FindFunctionOptions<Extra extends {}> {
  /**
   * Object used to initialize context.extra in the matcher and stopper callbacks.
   *
   * @remarks
   * `extra` is an object that can be used to implement advanced find algorithms.
   *
   * For example, if you want to find every 3rd match, `extra` could have a property
   * keeping track of how many matches were found so far in the matcher function
   * without affecting `context.results`.
   */
  extra?: Extra

  /**
   * Whether to search the collection in reverse.
   * @defaultValue false
   */
  reverse?: boolean

  /**
   * The index to start the find operation from.
   */
  startingIndex?: number
}

/**
 * The schema API for an entity.
 *
 * @typeParam T - the shape of the entity.
 * @typeParam ID - the type of the `$id` field in stored models.
 * @typeParam Model - the model as it exists in the DB (with the `$id` field).
 */
export interface SchemaAPI<T extends {}, ID extends string | number | symbol, Model = StoredModel<T>> {
  /**
   * Creates a new Model with an ID that can be persisted back to the DB.
   *
   * @param p - Properties to set on the new model.
   *
   * @returns The newly-primed model.
   */
  new: (p?: Partial<T>) => StoredModelUpdate<T>

  /**
   * Gets all models from the DB.
   *
   * @returns An array of all models in the collection.
   */
  getAll: () => Model[]

  /**
   * Saves models to the DB.
   *
   * @param models - Models to save to the DB.
   *
   * @returns An array of models that were saved.
   */
  save: (...models: Model[]) => Model[]

  /**
   * Alias for {@link save}.
   *
   * @remarks
   * Calling {@link save} from a seeder reads oddly,
   * so this alias was created to make the intent of the seeder clearer
   * even though it is actually performing the {@link save} operation under the hood.
   *
   * @param models - Models to load into the DB.
   *
   * @returns An array of models that were loaded into the DB.
   */
  load: (...models: Model[]) => Model[]

  /**
   * Creates and persists models to the DB.
   *
   * @remarks
   * This is similar to calling {@link new} and then calling {@link save}.
   * It has the added benefit of being able to create multiple models in a single call, unlike {@link new}.
   *
   * @param partials - Sets of properties to set on each model.
   *
   * @returns An array of models that were created.
   */
  create: (...partials: Partial<T>[]) => Model[]

  /**
   * Finds models by `$id`.
   *
   * @remarks
   * Under the hood, this is implemented with a lookup by `$id`.
   * It is more performant than the general-purpose {@link find} function.
   *
   * Note: Any `$id`s that were not found in the collection will not be represented in the results.
   * In other words, the results count <= the `$ids` count.
   *
   * @param $ids - Model IDs to find.
   *
   * @returns An array of models that match the `$id`s, in the order that the `$id`s were given.
   */
  findById: (...$ids: ID[]) => Model[]

  /**
   * Finds models in the collection.
   *
   * @remarks
   * This is a general-purpose function designed to support a wide range of use cases.
   *
   * @param matcher - A function that tests for matches.
   * @param stopper - A function that short-circuits the find operation when it returns true. Otherwise, find iterates through the entire collection.
   * @param options - An object that configures that find operation's behavior.
   *
   * @returns An array of models for which the `matcher` function returned true.
   */
  find: <Extra extends object>(
    matcher: (m: Model, context: FindFunctionContext<Model, Extra>) => boolean,
    stopper: (context: FindFunctionContext<Model, Extra>) => boolean,
    options?: FindFunctionOptions<Extra>
  ) => Model[]

  /**
   * @returns The number of models in the collection.
   */
  count: () => number

  /**
   * Useful internal structures, for debugging purposes.
   *
   * @remarks
   * Non-debug code should NOT depend on this as it can change at any time.
   * This is only exposed for debugging purposes.
   */
  debug: {
    collection: {
      cache: Record<ID, Model>
      array: Model[]
    }
  }
}

const newId = uuidv4

const makeSchema = <S extends Record<string, unknown>>(settings: Required<Pick<Settings<S>, 'schema'>> & Settings<S>) => {
  const SchemaBaseClass = z.ZodObject

  type AnySchemaDefinition = z.AnyZodObject

  type Infer<T> = T extends z.ZodType<any, any, any> ? z.infer<T> : never

  type InferredShapes<Type> = {
    [P in keyof Type as Type[P] extends AnySchemaDefinition ? P : never]: Type[P] extends AnySchemaDefinition ? Infer<Type[P]> : never
  }

  type SchemaShapes = InferredShapes<typeof settings.schema>

  // Might want to make this configurable...
  type SchemaIdType = IdType

  type SchemaAPIs<Type> = {
    // Filters out any values that aren't a proper schema shape.
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof SchemaShapes ? SchemaAPI<SchemaShapes[P], SchemaIdType> : never
  }

  type SchemaDefinitions<Type> = {
    // Filters out any values that aren't a proper schema shape.
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof SchemaShapes ? SchemaShapes[P] : never
  }

  const apiParts = Object.keys(settings.schema).map((name) => {
    const definition = settings.schema[name]

    type InferredType = Infer<typeof definition>
    type Model = { readonly $id: SchemaIdType } & InferredType
    type Collection = { cache: Record<SchemaIdType, Model>; array: Model[] }

    const isValidSchema = definition instanceof SchemaBaseClass

    const collection: Collection = { cache: {}, array: [] }

    const save: SchemaAPI<InferredType, SchemaIdType>['save'] = (...models) => {
      return models.map((m) => {
        const isNew = !(m.$id in collection.cache)

        collection.cache[m.$id] = clone(m)

        if (isNew) {
          collection.array.push(collection.cache[m.$id])
        }

        return clone(collection.cache[m.$id])
      })
    }

    const schema: SchemaAPI<InferredType, SchemaIdType> = {
      new: (p?) => {
        return { ...(p || {}), $id: newId() } as StoredModelUpdate<InferredType>
      },

      getAll: () => {
        return clone(collection.array)
      },

      save,

      load: save,

      create: (...partials) => {
        return schema.save(...partials.map((p) => schema.new(p) as StoredModel<InferredType>))
      },

      findById: (...$ids) => {
        return $ids.reduce((results: Model[], $id) => {
          const obj = collection.cache[$id]

          if (obj) {
            results.push(clone(obj))
          }

          return results
        }, [])
      },

      // find: <Extra>(matcher, stopper, options) => {
      find: (matcher, stopper, options) => {
        type Context = Parameters<typeof matcher>[1]

        const context: Context = {
          results: [],
          options,
          index: 0,
          count: collection.array.length,
          extra: options?.extra ? clone(options?.extra || {}) : ({} as Context['extra']),
        }

        const loop = (() => {
          const clampStart = (value: number) => Math.max(0, Math.min(collection.array.length - 1, value))

          if (options?.reverse) {
            return {
              start: clampStart(options?.startingIndex || collection.array.length - 1),
              condition: () => context.index > 0,
              iterate: () => context.index--,
            }
          }

          return {
            start: clampStart(options?.startingIndex || 0),
            condition: () => context.index < collection.array.length,
            iterate: () => context.index++,
          }
        })()

        for (context.index = loop.start; loop.condition(); loop.iterate()) {
          const m = collection.array[context.index]

          if (matcher(m, context)) {
            context.results.push(clone(m))
          }

          if (stopper(context)) {
            break
          }
        }

        return context.results
      },

      count: () => collection.array.length,

      debug: {
        collection,
      },
    }

    return { isValidSchema, name, schema, collection, zod: definition }
  })

  return apiParts.reduce(
    (container: { schema: SchemaAPIs<SchemaShapes>; zod: SchemaDefinitions<SchemaShapes> }, current) => {
      if (!current.isValidSchema) return container
      container.schema[current.name as keyof typeof container.schema] = current.schema as typeof container.schema[keyof typeof container.schema]
      container.zod[current.name as keyof typeof container.zod] = current.zod as typeof container.zod[keyof typeof container.zod]
      return container
    },
    { schema: {} as SchemaAPIs<SchemaShapes>, zod: {} as SchemaDefinitions<SchemaShapes> }
  )
}

/**
 * Makes a new, strongly-typed instance of an in-memory DB.
 *
 * @param settings - The settings governing the shape and behavior of the DB.
 *
 * @returns The memory DB.
 */
export const makeMemoryDB = <S extends {}>(settings: Settings<S> = {}) => {
  const { schema, zod } = makeSchema({ schema: {} as never, ...settings })

  const db = {
    zod,
    schema,
  }

  if (settings.seeder) {
    settings.seeder(db)
  }

  return db
}

export default makeMemoryDB
