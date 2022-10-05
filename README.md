# WORK IN PROGRESS

# memoryDB

A fully-typed in-memory DB.

## Why?

tldr: [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) / [Test-Driven Development (TDD)](https://www.agilealliance.org/glossary/tdd)

If you want the full rationale behind it, [jump to that section](#full-rationale-behind-memorydb).

## Installation

Dependencies:

* [zod](https://zod.dev/)

> TODO memoryDB will be adapted to work with other ways to define the shape of data, like yup...

Install both with your preferred package manager, e.g. `pnpm`:

```
pnpm add @nerdo/memorydb zod
```

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

MemoryDB is largely inspired by MirageJS. It's a great tool. I really liked the idea behind being able to ship a demo of a project without a back-end server. But I didn't want to rely on the fact that I would *need* to make API calls to a back-end server or use a language (protocol, whatever) like REST to express, in simple terms, "Hey, give me the data for this component". Programming languages are perfectly capable of expressing requests like that with simple function calls. 

> Consider a DB like FirestoreDB. You don't actually need to talk to a back-end server to interact with it!

I ended up tinkering with MirageJS and only using the data modeling features in it. It works pretty well when used that way - the data modeling tools are independent, but what I found to be lacking was the TypeScript support. To be clear, there _is_ TypeScript support for MirageJS, but I could not seem to find documentation on how to make the schema be fully typed. Furthermore, after working with it, I didn't want to have to do extra work even if it could work.

So MemoryDB was born with the following goals/guidelines...

1. There are really amazing, simple, low/no-dependency libraries that define the shape of data (e.g. zod, yup, etc.). They should be the Source of Truth.
2. The Developer Experience using MemoryDB should be fully typed by inference, leaving anything that needs to be explicitly typed to the Source of Truth.
3. It should be lightweight and focused on handling simple scenarios.

## example

`memory-api.ts`

```ts
// Set it up...
import { makeMemoryDB } from '@nerdo/memorydb'
import { z } from 'zod' // REQUIRED
import { faker } from '@faker-js/faker' // optional, for illustration purposes...

// Define the shape of your data...
const zContact = z.object({
  name: z.string().min(1),
  email: z.string().email().min(5).optional(),
  avatarUrl: z.string().url().optional(),
  address: z
    .object({
      street: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(5).max(2),
      zip: z.string().min(5).max(5).regex(/\d{5}/, { message: 'Zip code can only contain numbers' }),
    })
    .optional(),
})

const SEED_NUM_CONTACTS = 100

const memory = makeMemoryDB({
  schema: {
    contact: zContact,
  },

  seeder(db) {
    // Make the fake data deterministic with a fixed seed
    faker.seed(1953982952)

    // Loop and create contacts, with some randomness in which optional properties are set 
    for (let i = 0; i < SEED_NUM_CONTACTS; i++) {
      const $id = faker.datatype.uuid()
      const name = faker.name.fullName()
      const avatarUrl = i % 9 !== 0 ? faker.internet.avatar() : void 0
      const address =
        i % 8 !== 0
          ? { street: faker.address.streetAddress(), city: faker.address.city(), state: faker.address.stateAbbr(), zip: faker.address.zipCode() }
          : void 0
      const email = i % 7 === 0 ? faker.internet.email() : void 0

      db.schema.contact.save({ $id, name, email, avatarUrl, address })
    }
  },
})

// Optional, expose the memory db for debugging
if (window) {
  // @ts-ignore
  window.memory = memory
}

// Export an API for working with your data...
// These functions can serve as a drop in for REST API calls, for example
export const api = {
  getContacts: async () => memory.schema.contact.getAll(),

  pageContacts: async (settings: { cursor: number; limit: number }) => {
    const { cursor, limit } = settings

    const cursorEnd = cursor + limit

    const slice = memory.schema.contact.find(
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
}

export default api
```

`ContactList.ts`

```ts
// Use it...
import { pageContacts } from './memory-api'
import { useInfiniteQuery } from '@tanstack/react-query' // For example...
import React from 'react'

const ContactCard = (props: AddressBookEntryProps) => {
  const { contact } = props

  return (
    <div key={contact.$id} className="card bg-neutral">
      <div className="gap-2 card-body">
        <div className="flex justify-center">
          <div className="badge badge-sm">ID {contact.$id}</div>
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

export const ContactList = () => {
  const contactQuery = useInfiniteQuery(['contacts'], ({ pageParam }) => pageContacts({ cursor: pageParam || 0, limit: 20 }), {
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
              key={contact.$id}
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

