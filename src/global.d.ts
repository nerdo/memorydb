import { z } from 'zod'

type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> }
type Cast<X, Y> = X extends Y ? X : Y
// type FromEntries<T> = T extends [infer Key, PropType][] ? { [K in Cast<Key, PropType>]: Extract<T[number], [K, unknown]> } : { [key in string]: any }
type FromEntries<T> = T extends [infer Key, PropType][] ? { [K in Cast<Key, PropType>]: Extract<T[number],[K]> } : { [key in string]: any }
// type FromEntries<T> = T extends [infer Key, PropType][] ? { [K in Cast<Key, PropType>]: Extract<ArrayElement<T>, [K, any]>[1] } : { [key in string]: any }
type KeyValue<T> = {
  [P in keyof T]: {
    key: P;
    value: T[P];
  }
}[keyof T];

export type FromEntriesWithReadOnly<T> = FromEntries<DeepWriteable<T>>

declare global {
  interface ObjectConstructor {
    // fromEntries<T>(obj: T): FromEntriesWithReadOnly<T>
  }
}
class Schema<Shape extends {}> {
  /**
   * A property to [hopefully] make the Schema class uniquely identifiable.
   *
   * @remarks
   * zod objects, for example, have a `shape` property, and since `id` is optional,
   * something else is needed to uniquely identify this class.
   */
  $memorydb = MEMORYDB

  /**
   * The shape of the schema (currently the zod object).
   */
  shape!: Shape

  /**
   * Custom settings for the identifier for this schema.
   */
  id?: IdSetting

  /**
   * Declare the schema verbosely.
   *
   * @remarks
   * Use this to define custom settings for the schema's identifier.
   */
  constructor(declaration: ExtendedSchemaDeclaration<Shape>) {
    this.shape = declaration.shape

    const name = declaration.id?.name || '$id'

    // This isn't right, but I can't think of a better way right now...
    const next = declaration.id?.next || uuidv4

    const object = declaration.id?.object || ((value: AvailableIdTypes) => ({ [name]: value }))

    const id: IdSetting = {
      name,
      next,
      object,
    }

    this.id = id
  }

  /**
   * Declare the schema verbosely.
   *
   * @remarks
   * Use this to define custom settings for the schema's identifier.
   * This is an alias for the constructor.
   */
  static declare<T extends {}>(declaration: ExtendedSchemaDeclaration<T>) {
    return new Schema(declaration)
  }
}
const sobj: (readonly ["contact" | "address" | "todos", Required<Schema<z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
}, {
    name: string;
    email: string;
}> | z.ZodObject<{
    street: z.ZodString;
    city: z.ZodString;
    state: z.ZodString;
}, "strip", z.ZodTypeAny, {
    street: string;
    city: string;
    state: string;
}, {
    street: string;
    city: string;
    state: string;
}> | Schema<z.ZodObject<{
    label: z.ZodString;
    completed: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    label: string;
    completed: boolean;
}, {
    label: string;
    completed: boolean;
}>>>>])[]

type S = typeof sobj
type t1 = ArrayElement<S>
type t2 = S[number]

const data = [['key1', 1], ['key2', 2]] as const
const d1 = {
  key1: 1,
  key2: 2,
} as const

type MappedEntries<Type> = {
  [P in keyof Type]: [P, Type[P][1]]
}

const e1 = Object.keys(d1).map(k => [k as keyof typeof d1, d1[k] as typeof d1[k]] as const)
type me = MappedEntries<typeof e1>
type tt = FromEntriesWithReadOnly<typeof e1>

const obj1 = Object.fromEntries(e1)
type kv = KeyValue<typeof obj1>
type kv2 = KeyValue<typeof sobj>

type t3 = typeof data
type at = t3[number]

type test = FromEntriesWithReadOnly<typeof sobj>

const schema = 
    {
      contact: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
      }),
      todos: Schema.declare({
        shape: z.object({
          label: z.string(),
          completed: z.boolean(),
        }),
        id: {
          name: 'CustomTodoID',
        },
      }),
    }

type kv3 = KeyValue<typeof schema>
