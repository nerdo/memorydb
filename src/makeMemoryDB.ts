import { z } from 'zod'
import { clone } from '@nerdo/utils'
import { v4 as uuidv4 } from 'uuid'

type Expand<T> = T extends T ? { [K in keyof T]: T[K] } : never
// type Expand<T> = {} & { [P in keyof T]: T[P] }
// type ExpandRecursively<T> = T extends T ? { [K in keyof T]: ExpandRecursively<T[K]> } : never

export type IdTypes = string | number

type ShapeDeclaration = z.AnyZodObject

export const defaultIdSettings = {
  name: 'id',
  next: (_schemaName: string) => uuidv4(),
  shape: z.object({ id: z.string() }),
}

export class Schema<Shape extends {}, V extends IdTypes, O extends ShapeDeclaration, N extends string> {
  /**
   * A property to [hopefully] make the Schema class uniquely identifiable.
   *
   * @remarks
   * zod objects, for example, have a `shape` property, and since `id` is optional,
   * something else is needed to uniquely identify this class.
   */
  $memorydb = true

  /**
   * The shape of the schema (currently the zod object).
   */
  shape: Shape

  /**
   * Settings for the identifier for this schema.
   */
  id: IdSetting<V, O, N>

  /**
   * Declare the schema verbosely.
   *
   * @remarks
   * Use this to define custom settings for the schema's identifier.
   */
  constructor(declaration: ExtendedSchemaDeclaration<Shape, V, O, N>) {
    this.shape = declaration.shape
    this.id = declaration.id
  }

  /**
   * Declare the schema verbosely.
   *
   * @remarks
   * Use this to define custom settings for the schema's identifier.
   * This is an alias for the constructor.
   */
  static declare<T extends {}, V extends IdTypes, O extends ShapeDeclaration, N extends string>(declaration: ExtendedSchemaDeclaration<T, V, O, N>) {
    return new Schema(declaration)
  }
}

export type StoredModel<Identifiable extends {}, T extends {}> = Identifiable & T

export type StoredModelUpdate<Identifiable extends {}, T extends {}> = Identifiable & Partial<T>

export interface RequiredSchemaDeclaration<
  SchemaDeclaration extends {},
  IdType extends IdTypes,
  IdShapeDeclaration extends ShapeDeclaration,
  N extends string
> {
  shape: SchemaDeclaration
  id: Required<IdSetting<IdType, IdShapeDeclaration, N>>
}

export interface ExtendedSchemaDeclaration<
  SchemaDeclaration extends {},
  IdType extends IdTypes,
  IdShapeDeclaration extends ShapeDeclaration,
  N extends string
> {
  shape: SchemaDeclaration
  id: IdSetting<IdType, IdShapeDeclaration, N>
}

export type IdSetting<T extends IdTypes, S extends ShapeDeclaration, N extends string> = {
  name: string
  next: (schemaName: N) => T
  shape: S
}

/**
 * Settings governing the shape and initialization of the DB.
 *
 * @typeParam S - the shape of the schema
 */
export interface Settings<S extends Record<string, unknown>> {
  /**
   * The schema declarations.
   */
  schema?: S

  /**
   * A seeder callback function for the sake of priming the DB.
   */
  seeder?: (db: ReturnType<typeof makeSchema<S>>) => void
}

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
 * @typeParam IdType - the type of the `id` field in stored models.
 * @typeParam Model - the model as it exists in the DB (with the `id` field).
 * @typeParam ModelUpdate - the partial model as it exists in the DB (with the `id` field).
 */
export interface SchemaAPI<T extends {}, IdType extends IdTypes, Model extends {}, ModelUpdate extends {}> {
  /**
   * Creates a new Model with an ID that can be persisted back to the DB.
   *
   * @param p - Properties to set on the new model.
   *
   * @returns The newly-primed model.
   */
  new: (p?: Expand<Partial<T>>) => Expand<ModelUpdate>

  /**
   * Gets all models from the DB.
   *
   * @returns An array of all models in the collection.
   */
  getAll: () => Expand<Model>[]

  /**
   * Saves models to the DB.
   *
   * @param models - Models to save to the DB.
   *
   * @returns An array of models that were saved.
   */
  save: (...models: Expand<Model>[]) => Expand<Model>[]

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
  load: (...models: Expand<Model>[]) => Expand<Model>[]

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
  create: (...partials: Expand<Partial<T>>[]) => Expand<Model>[]

  /**
   * Finds models by `id`.
   *
   * @remarks
   * Under the hood, this is implemented with a lookup by `id`.
   * It is more performant than the general-purpose {@link find} function.
   *
   * Note: Any `id`s that were not found in the collection will not be represented in the results.
   * In other words, the results count <= the `ids` count.
   *
   * @param ids - Model IDs to find.
   *
   * @returns An array of models that match the `id`s, in the order that the `id`s were given.
   */
  findById: (...ids: IdType[]) => Expand<Model>[]

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
    matcher: (m: Expand<Model>, context: FindFunctionContext<Expand<Model>, Extra>) => boolean,
    stopper: (context: FindFunctionContext<Expand<Model>, Extra>) => boolean,
    options?: FindFunctionOptions<Extra>
  ) => Expand<Model>[]

  /**
   * Deletes models by `id`.
   *
   * @remarks
   * Under the hood, this is implemented with a lookup by `id`.
   * It is more performant than the general-purpose {@link find} function.
   *
   * Note: Any `id`s that were not found in the collection will be ignored.
   *
   * @param ids - Model IDs to find.
   *
   * @returns An array of models that were deleted.
   */
  deleteById: (...ids: IdType[]) => Expand<Model>[]

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
      cache: Map<IdType, Expand<Model>>
      array: Expand<Model>[]
    }
  }
}

const makeSchema = <S extends {}>(settings: Required<Pick<Settings<S>, 'schema'>> & Settings<S>) => {
  const SchemaBaseClass = z.ZodObject

  type Infer<T> = T extends z.ZodType<any, any, any> ? z.infer<T> : never

  type GetDeclared<T> = T extends Schema<infer MS, infer IT, infer IS, any>
    ? {
        modelShape: MS
        idType: IT
        idShape: IS
      }
    : { modelShape: T extends {} ? T : {}; idType: ReturnType<typeof defaultIdSettings.next>; idShape: typeof defaultIdSettings.shape }

  type ResultSchemaAPIs<T extends {}> = {
    [K in keyof T]: GetDeclared<T[K]> extends { modelShape: infer MS extends {}; idType: infer IT extends IdTypes; idShape: infer IS extends {} }
      ? SchemaAPI<Infer<MS>, IT, StoredModel<Infer<IS>, Infer<MS>>, StoredModelUpdate<Infer<IS>, Infer<MS>>>
      : never
  }

  const r = Object.entries(settings.schema).reduce(
    (result, [name, schemaOrShape]) => {
      type Declared = GetDeclared<typeof schemaOrShape>

      const schema =
        schemaOrShape instanceof Schema
          ? schemaOrShape
          : Schema.declare({
              shape: schemaOrShape as Declared['modelShape'],
              id: defaultIdSettings,
            })

      if (!(schema.shape instanceof SchemaBaseClass)) return result

      type ModelShape = Infer<typeof schema.shape>
      type IdShape = Readonly<Infer<typeof schema.id.shape>>
      type Model = StoredModel<IdShape, ModelShape>
      type ModelUpdate = StoredModelUpdate<IdShape, ModelShape>
      type IdType = ReturnType<typeof schema.id.next>

      const collection: { cache: Map<IdType, Model>; array: Model[] } = { cache: new Map(), array: [] }

      const save: SchemaAPI<ModelShape, IdType, Model, ModelUpdate>['save'] = (...models) => {
        return models.map((m: Model) => {
          const key = m[schema.id.name as keyof typeof m]

          const isNew = !(key in collection.cache)

          collection.cache.set(key, clone(m))

          if (isNew) {
            collection.array.push(collection.cache.get(key))
          }

          return clone(collection.cache.get(key))
        })
      }

      const api: SchemaAPI<ModelShape, IdType, Model, ModelUpdate> = {
        new: (p?) => {
          return { ...(p || {}), [schema.id.name]: schema.id.next(name) } as ModelUpdate
        },

        getAll: () => {
          return clone(collection.array)
        },

        save,

        load: save,

        create: (...partials) => {
          // TODO use zod to ensure that all required data is here for saving instead of coercing to Model via unknown
          return api.save(...partials.map((p) => api.new(p) as unknown as Model))
        },

        findById: (...ids) => {
          return ids.reduce((results: Model[], id) => {
            const obj = collection.cache.get(id)

            if (obj) {
              results.push(clone(obj))
            }

            return results
          }, [])
        },

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

        deleteById: (...ids) => {
          if (!ids.length) return []

          const deleted: Model[] = []

          for (const id of ids) {
            const m = collection.cache.get(id)
            if (m) {
              deleted.push(m)
            }
            collection.cache.delete(id)
          }

          const remainingIds = [...ids]
          collection.array = collection.array.filter((m) => {
            if (!remainingIds.length) return true

            const indexOfMatch = remainingIds.indexOf(m[schema.id.name])
            const keep = indexOfMatch === -1
            if (!keep) {
              remainingIds.splice(indexOfMatch, 1)
            }
            return keep
          })

          return deleted
        },

        count: () => collection.array.length,

        debug: {
          collection,
        },
      }

      // @ts-ignore-next
      result.schema[name] = api

      // @ts-ignore-next
      result.zod[name] = schema.shape

      return result
    },

    { schema: {} as ResultSchemaAPIs<typeof settings.schema>, zod: {} as typeof settings.schema }
  )

  return r
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
