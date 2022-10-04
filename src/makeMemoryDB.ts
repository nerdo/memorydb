import { z } from 'zod'
import { clone } from '@nerdo/utils'
import { v4 as uuidv4 } from 'uuid'

/**
 * Settings governing the shape and initialization of the DB.
 *
 * @typeParam S - the shape of the schema
 */
export interface Settings<S extends Record<string, unknown>> {
  /**
   * The schema definitions.
   */
  schema?: SchemaList<S>

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
 * @typeParam Model - the shape of each model in the results.
 * @typeParam Extra - the shape of the extra (custom) context object
 */
export interface FindFunctionContext<Model, Extra extends object> {
  /**
   * The results of the find operation so far.
   */
  readonly results: Model[]

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
export interface FindFunctionOptions<Extra extends object> {
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
 * @typeParam T - the shape of the entity
 * @typeParam I - the type of the `$id` field in stored models
 * @typeParam Model - the model as it exists in the DB (with the `$id` field)
 */
export interface Schema<T extends {}, I, Model = StoredModel<T>> {
  /**
   * Creates a new Model with an ID that can be persisted back to the DB.
   *
   * @param p - Properties to set on the new model.
   *
   * @returns The newly-primed model.
   */
  new: (p?: Partial<T>) => Model

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
  findById: (...$ids: I[]) => Model[]

  // TODO find should deal with the Model in the DB, i.e. the Zod model... maybe - might depend on whether or not we validate with Zod
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
      cache: Record<IdType, Model>
      array: Model[]
    }
  }
}

export type SchemaList<Type> = {
  [P in keyof Type]: Type[P] extends z.AnyZodObject ? Type[P] : never
}

const newId = uuidv4

const makeSchema = <S extends Record<string, unknown>>(settings: Required<Pick<Settings<S>, 'schema'>> & Settings<S>) => {
  type InferZodTypes<Type> = {
    [P in keyof Type as Type[P] extends z.AnyZodObject ? P : never]: Type[P] extends z.AnyZodObject ? z.infer<Type[P]> : never
  }

  type ZodTypes = InferZodTypes<typeof settings.schema>

  // Might want to make this configurable...
  type SchemaIdType = IdType

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type SchemaMap<Type> = {
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof ZodTypes ? Schema<ZodTypes[P], SchemaIdType> : never
  }

  // Filter out any of our non inferred zod keys (e.g. if someone tries to set a schema prop to a primitive like z.string()
  type ZodMap<Type> = {
    [P in keyof Type as Type[P] extends never ? never : P]: P extends keyof ZodTypes ? ZodTypes[P] : never
  }

  const apiParts = Object.keys(settings.schema).map((name) => {
    const zod = settings.schema[name]

    type Z = z.infer<typeof zod>
    type Model = { readonly $id: SchemaIdType } & Z
    type Collection = { cache: Record<SchemaIdType, Model>; array: Model[] }

    const isValidSchema = zod instanceof z.ZodObject

    const collection: Collection = { cache: {}, array: [] }

    const save: Schema<Z, SchemaIdType>['save'] = (...models) => {
      return models.map((m) => {
        const isNew = !(m.$id in collection.cache)

        collection.cache[m.$id] = clone(m)

        if (isNew) {
          collection.array.push(collection.cache[m.$id])
        }

        return clone(collection.cache[m.$id])
      })
    }

    const schema: Schema<Z, SchemaIdType> = {
      new: (p) => {
        return { ...(p || {}), $id: newId() }
      },

      getAll: () => {
        return clone(collection.array)
      },

      save,

      load: save,

      create: (...partials) => {
        return schema.save(...partials.map((p) => schema.new(p)))
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

    return { isValidSchema, name, schema, collection, zod }
  })

  return apiParts.reduce(
    (container: { schema: SchemaMap<ZodTypes>; zod: ZodMap<ZodTypes> }, current) => {
      if (!current.isValidSchema) return container
      container.schema[current.name as keyof typeof container.schema] = current.schema as typeof container.schema[keyof typeof container.schema]
      container.zod[current.name as keyof typeof container.zod] = current.zod as typeof container.zod[keyof typeof container.zod]
      return container
    },
    { schema: {} as SchemaMap<ZodTypes>, zod: {} as ZodMap<ZodTypes> }
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
  const { schema, zod } = makeSchema({ schema: {} as SchemaList<S>, ...settings })

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
