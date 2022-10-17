# memoryDB

A fully-typed in-memory DB.

## Why?

tldr: [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) / [Test-Driven Development (TDD)](https://www.agilealliance.org/glossary/tdd)

If you want the full rationale behind it, [jump to that section](#full-rationale-behind-memorydb).

## Installation

Dependencies:

* [zod](https://zod.dev/)

> memoryDB will probably be adapted to work with other ways to define the shape of data, like yup... but for now, I'm in love with `zod`.

Install both with your preferred package manager, e.g. `pnpm`:

```
pnpm add @nerdo/memorydb zod
```

## How to use memoryDB

In my opinion, there're two ways to see what memoryDB is capable of. Follow the guide below, or [look at its tests](https://github.com/nerdo/memorydb/blob/main/src/makeMemoryDb.test.ts).

I recommend starting with the guide to get a sense for it first, and then jump into the tests as necessary.

For the most part, you may not need to dig into the tests since memoryDB is pretty well-typed, but it isn't perfect. I had to abandon some attempts to strongly type the settings, for example, because I wasn't able to get its output fully typed that way. It's all a work in progress, and hopefully will improve over time, but for now, intellisense and tests are your best friends.

Without further ado, here is the recommended way to use memoryDB.

### Create an in memory database

Create a file that will define the database for your application.

`db/memory.ts`

```ts
import { makeMemoryDB } from '@nerdo/memorydb'
import { z } from 'zod' // Required depdency
import { faker } from '@faker-js/faker' // Not required, but incredibly useful for generating test data

// Define the shape of your data...
// I recommend keeping these declarations in a separate file, but since this example only deals with one entity, I'm defining it alongside the memorydb.
export const contact = z.object({
  // It isn't necessary to define an id field for memorydb to work (it adds an id field automatically), but good to have for completeness
  id: z.string(),
  
  // The rest of the shape of the entity...
  name: z.string().min(1),
  email: z.string().email().min(5).optional(),
  avatarUrl: z.string().url().optional(),
  
  // You can have nested data, too, if you like... but flatter data is generally simpler to deal with.
  address: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(5).max(2),
      zip: z.string().min(5).max(5).regex(/\d{5}/, { message: 'Zip code can only contain numbers' }),
    })
    .optional(),
})

// Export the shape of the entity to be used elsewhere
export type Contact = z.infer<typeof contact>

const SEED_NUM_CONTACTS = 100

export const memorydb = makeMemoryDB({
  schema: {
    contact,
  },

  seeder(db) {
    // Make the fake data deterministic with a fixed seed.
    faker.seed(1953982952)

    // Loop and create contacts, with some randomness in which optional properties are set 
    for (let i = 0; i < SEED_NUM_CONTACTS; i++) {
      const id = faker.datatype.uuid()
      const name = faker.name.fullName()
      const avatarUrl = i % 9 !== 0 ? faker.internet.avatar() : void 0
      const address =
        i % 8 !== 0
          ? { street: faker.address.streetAddress(), city: faker.address.city(), state: faker.address.stateAbbr(), zip: faker.address.zipCode() }
          : void 0
      const email = i % 7 === 0 ? faker.internet.email() : void 0

      db.schema.contact.save({ id, name, email, avatarUrl, address })
    }
  },
})

// Optional, expose the memory db for debugging your application.
// Inspect it in your console to see what's actually in the database.
if (window) {
  // @ts-ignore
  window.memorydb = memorydb
}

export default memorydb
```

### Define an API layer for accessing and mutating your data in a separate file

For a setup that is ready for Clean Architecture, don't depend on memoryDB directly from your app.

Access it from a thin API layer that abstracts the operations you wish to perform with the data. This layer will serve as a blueprint for how the real implementation of your data layer should behave.

`api/blueprint.ts`

```ts
import { memorydb } from './db/memory'

// Re-export any types you need from your Source of Truth, or set this up in a separate, more sacred file.
export { Contact } from './db/memory'

// Export an API for working with your data...
// These functions can serve as a drop in for REST API calls, for example,
// and serve as a blueprint for creating the real API.
export const blueprint = {
  getContacts: async () => memorydb.schema.contact.getAll(),

  // For pagination...
  pageContacts: async (settings: { cursor: number; limit: number }) => {
    const { cursor, limit } = settings

    const cursorEnd = cursor + limit

    const slice = memorydb.schema.contact.find(
      (_model, context) => context.index < cursorEnd,
      (context) => context.results.length === limit,
      { startingIndex: cursor }
    )
    const nextCursor = cursor + slice.length < memory.schema.contact.count() ? cursor + slice.length : void 0

    return {
      slice,
      nextCursor,
    }
  },
  
  // etc., for example, operations to mutate data...
  // This is where you craft the most natural interface for your app to have to deal with.
}

export default blueprint
```

For the sake of Clean Architecture, this should be the *only* file in your application that depends on `db/memory.ts` (and on `memoryDB` itself, albeit indirectly).

Anything that needs access to data in your application from here on out should depend on _the shape of the api_ defined in `api/blueprint.ts`. Let's take a look at one way to do that in the next step...

> Why are these functions defined as `async` when they aren't making asynchronous calls? Because when you get to making the real API, presumably with network calls, they _will_ be asynchronous. Setting up your blueprint to work in this way means you shouldn't have to change the interface or your code when it's time to deal with the real thing.

### Consume the API from your application

Here's a potential `ContactList` React component that would consume the API.

Note how it doesn't depend on the concrete implementation of the api, but its shape, which is highly likely to change early on during development, but will start to stabilize as our design decisions are vetted through testing.

This means that as we change things during development, TypeScript will help us keep tabs on all of the places we need to change things when we change how the API works and the shape of the underlying data with zod and memoryDB.

`ContactList.ts`

```ts
import { blueprint } from './api/blueprint'
import { ContactCard } from './ContactCard'
import { useInfiniteQuery } from '@tanstack/react-query'
import React from 'react'

interface ContactListProps {
  api: typeof blueprint
}

export const ContactList = (props: ContactListProps) => {
  const { api } = props
  
  const contactQuery = useInfiniteQuery(['contacts'], ({ pageParam }) => api.pageContacts({ cursor: pageParam || 0, limit: 20 }), {
    getNextPageParam: (lastPage, _pages) => lastPage.nextCursor,
  })

  type ContactQueryData = typeof contactQuery.data

  if (contactQuery.status === 'loading') {
    return <div>Loading...</div>
  }

  if (contactQuery.status === 'error') {
    return <div>Error!</div>
  }

  return (
    <div className="grid grid-cols-3 gap-10 p-10">
      {contactQuery.data.pages.map((page, p) => (
        <React.Fragment key={p}>
          {page.data.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
            />
          ))}
        </React.Fragment>
      ))}

      <div className="justify-self-center place-self-center">
        <button
          onClick={() => contactQuery.fetchNextPage()}
          disabled={!contactQuery.hasNextPage || contactQuery.isFetchingNextPage}
          className="btn btn-default"
        >
          {contactQuery.isFetchingNextPage ? 'Loading more...' : contactQuery.hasNextPage ? 'Load More' : 'No more!'}
        </button>
      </div>
      <div>{contactQuery.isFetching && contactQuery.isFetchingNextPage ? 'Fetching...' : null}</div>
    </div>
  )
}

export default ContactList
```

The `ContactList` component depends on the `ContactCard` which we will define now.

Here is an example of how a `ContactCard` component might start out as purely presentational. No need to pass it the API (although you might at some point).

`ContactCard.ts`

```ts
import { Contact } from './api/blueprint'

interface ContactCardProps {
  contact: Contact
}

const ContactCard = (props: ContactCardProps) => {
  const { contact } = props

  return (
    <div key={contact.id} className="card bg-neutral">
      <div className="gap-2 card-body">
        <div className="flex justify-center">
          <div className="badge badge-sm">ID {contact.id}</div>
        </div>

        <div className="flex items-start card-title align-baseline">
          {contact.avatarUrl && (
            <div className="flex-grow-0">
              {/* Use first and last initial in avatar alt tag */}
              <img
                src={contact.avatarUrl}
                alt={contact.name
                  .split(/\s+/)
                  .filter((_, i, array) => i === 0 || i === array.length - 1)
                  .map((name) => name[0])
                  .join('')}
                width="32"
                height="32"
                className="rounded-full"
              />
            </div>
          )}
          <h3 className="flex-1">{contact.name}</h3>
        </div>

        {(contact.email || contact.address) && (
          <address className="grid grid-cols-1 gap-2">
            {contact.email && <div>{contact.email}</div>}
            {contact.address && Object.keys(contact.address).length && (
              <div>
                <div>{contact.address.street}</div>
                <div>
                  {contact.address.city}, {contact.address.state} {contact.address.zip}
                </div>
              </div>
            )}
          </address>
        )}
      </div>
    </div>
  )
}

export default ContactCard
```

Again, we've only made it depend on types defined in our blueprint. Sure, it's re-exported from our memoryDB, but the layer of abstraction is important to point out and can save you from the headaches of depending directly on anything from `db/memory.ts`. Fight the urge! :)

### Iterate on development

Let's explore what's it like to iterate on this process.

This example is a bit contrived, but let's say we wanted to add the ability to update a `Contact`. For the sake of brevity, instead of creating a full blown UI with inputs to do so, let's just say we'll have a button on each `ContactCard` that will update some of the contact's information with hard-coded data, say, setting the name to `George Castanza`.

Let's start with the UI change.

`ContactCard.ts` (partial)

```ts
import { blueprint, Contact } from './api/blueprint'
import { useMutation } from '@tanstack/react-query'

interface ContactCardProps {
  api: typeof blueprint
  contact: Contact
  onUpdateContact?: (contact: Contact) => unknown
}

export const ContactCard = (props: ContactCardProps) => {
  const { api, contact, onUpdateContact } = props

  const mutation = useMutation(
    async (incoming: ContactUpdate) => api.updateContact(incoming),
    {
      onSuccess: (c) => {
        onUpdateContact?.(c)
      },
    }
  )
  
  const updateName = (c: Contact) => {
    mutation.mutate({ id: c.id, name: 'George Castanza' })
  }

  return (
    <div key={contact.id} className="card bg-neutral">
      <div className="gap-2 card-body">
        {/* ... */}
    
        {onUpdateContact && (
          <div className="card-actions self-center">
            <button className="btn btn-default" onClick={() => updateName(contact)}>
              Test Update
            </button>
          </div>
        )}
    </div>
  )
}
```

This iteration leverages React Query's mutations, but the important thing to note here is that we're now passing in the `api` to the component to get access to an `updateContact` function which we haven't written yet.

Let's write it...

`api/blueprint.ts` (partial)

```ts
// ...
export { Contact } from './db/memory'

export type ContactUpdate = Omit<Contact, 'address'> & { address?: Partial<Contact['address']> }

export const blueprint = {
  // ...
  
  updateContact: async (props: ContactUpdate) => {
    const [contact] = memorydb.schema.contact.findById(props.id)

    if (!contact) throw new Error(`Contact #${props.id} not found.`)

    const emptyAddress = {
      zip: '',
      city: '',
      state: '',
      street: '',
    }

    const address = props.address
      ? {
          ...emptyAddress,
          ...(contact.address || {}),
          ...props.address,
        }
      : contact.address

    const update = {
      ...contact,
      ...props,
      address,
    }

    const [newContact] = memorydb.schema.contact.save(update)

    return newContact
  },
}

export default blueprint
```

The first change here is we've introduced a `ContactUpdate` type, which is based on the shape of `Contact`.

This implementation of `updateContact` is a little more robust than it needs to be for our example, but it is meant to illustrate the kinds of things you  might have to deal with when there is nested data. Much of what's in the body of this function is to deal with that.

I'll leave it as an exercise for you to tinker with, but the important bits here are that we follow this pattern to update data:

1. Find the entity in the database with `findById`.
2. Prepare the new model by merging in the new props.
3. Call `save` and pass in the updated entities.

Notice I said entities, plural. With the exception of the function `new()`, memoryDB is designed so that if you can do it to a single entity, you should be able to do it to multiple entities in the same way.

So aside from `new()`, schema functions can take multiple inputs and will always return an array.

### Summary

That's the gist of it.

You're certainly free to use memoryDB however you see fit, but again, for the sake of Clean Architecture this is the recommended way to use it.

If you're curious as to why this pattern is so important to me and how memoryDB came about, read on...

## Full rationale behind memoryDB

Although I don't always achieve it, I strive to build things with Clean Architecture in mind.

I also love TDD.

With both, dealing with the data layer often becomes tricky really quickly.

Also, I _really_ dislike *depending* on making API calls (anything involving a network connection) and always prefer to "just call a function"...

Consider the TDD scenario...

Regarldess of what app you're writing, you'll probably need to get data from somewhere. In a typical Web app, sure, that will probably come from some sort of API call, whether REST or GraphQL or whatever you prefer.

But when I'm starting a new project, all I really care about is that I can (1) _call a function_ and (2) _the function returns some data_. How it happens inside the function is generally of no concern to me.

So, I ~~want~~ *need* it to be as simple as possible, so I can concentrate on the things that do matter to me, like, "What is the shape of my data?" and "What kind of functions do I want to write to interact with the data so that the Developer Experience for this is intuitive, helpful, and ergonomic?"

As long as my functions are flexible (async at a bare minimum) and expressive enough, I should be able to swap them out for the real implementation later.

Doing things this way has several advantages...

* Simplicity: Simpler, faster tests - no fumbling with API calls in an environment where the API calls aren't the subject of the tests!
* Focus: The subject of the tests are clearer and more prominent.
* Intention: The data layer is *deliberately* designed _and_ simultaenously abstracted away.

That last point is critical.

Achieving really good abstractions can often be painful, but with the right tools, that pain might not just be taken away, but transformed into something useful.

### A few more things to consider...

There may be some tools that do this really well already, but in my search I couldn't find everything I was looking for, which is ironic, because in my mind, I was looking for something much simpler than the soltuions I came across.

I found many solutions that dealt with abstracting away REST APIs, but that wasn't my aim. I really just wanted tools to quickly, simply abstract away the data layer.

memoryDB is largely inspired by MirageJS. It's a great tool. I really liked the idea behind being able to ship a demo of a project without a back-end server. But I didn't want to rely on the fact that I would *need* to make API calls to a back-end server or use a language (protocol, whatever) like REST to express, in simple terms, "Hey, give me the data for this component". Programming languages are perfectly capable of expressing requests like that with simple function calls. 

> Consider a DB like FirestoreDB. You don't actually need to talk to a back-end server to interact with it!

I ended up tinkering with MirageJS and only using the data modeling features in it. It works pretty well when used that way because the data modeling tools are independent of the API mocking, but what I found was that it lacked TypeScript support. To be clear, there _is_ TypeScript support for MirageJS, but I could not seem to find documentation on how to make the schema be fully typed, and I ultimately wanted a solution that could produce the appropriate types with minimal fuss, so I could focus on iterating.

So memoryDB was born with the following goals/guidelines...

1. There are really amazing, simple, low/no-dependency libraries that define the shape of data (e.g. zod, yup, etc.). They should be the Source of Truth.
2. The Developer Experience using memoryDB should be fully typed by inference (or as close as possible to it), leaving anything that needs to be explicitly typed to the Source of Truth.
3. It should be lightweight and focused on handling simple scenarios, with more complex scenarios left to the developer via composition (e.g. relations).
