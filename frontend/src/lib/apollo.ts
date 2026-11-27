import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { ErrorLink } from '@apollo/client/link/error'
import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { Observable } from 'rxjs'
import { getAccessToken, getSessionVersion } from './auth-tokens'
import { refreshSession } from './session-refresh'

const graphQlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:3000/graphql'
const httpLink = new HttpLink({ uri: graphQlUrl })


const authLink = new SetContextLink((previousContext) => {
  const token = getAccessToken()

  return {
    requestVersion: previousContext.requestVersion ?? getSessionVersion(),
    headers: {
      ...previousContext.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }
})

const sessionGate = new ApolloLink((operation, forward) => new Observable(observer => {
  const version = operation.getContext().requestVersion as number
  const subscription = forward(operation).subscribe({
    next: result => { if (version === getSessionVersion()) observer.next(result); else observer.error(new Error('Session changed during request')) },
    error: error => observer.error(error), complete: () => observer.complete(),
  })
  return () => subscription.unsubscribe()
}))

const refreshLink = new ErrorLink(({ error, operation, forward }) => {
  const context = operation.getContext()
  if (!CombinedGraphQLErrors.is(error) || context.hasRetriedAuth || context.requestVersion === undefined) return
  const unauthenticated = error.errors.some((item) => item.extensions?.code === 'UNAUTHENTICATED')
  if (!unauthenticated) return
  if (['Login', 'Logout', 'Refresh', 'Register', 'RegisterWithInvitation'].includes(operation.operationName ?? '')) return
  // A mutation may have committed before returning an auth error; never replay it.
  if (operation.query.definitions.some(def => def.kind === 'OperationDefinition' && def.operation === 'mutation')) return
  return new Observable((observer) => {
    let active = true
    let subscription: { unsubscribe: () => void } | undefined
    void refreshSession(context.requestVersion as number).then((outcome) => {
      if (!active) return
      if (outcome !== 'success' || context.requestVersion !== getSessionVersion()) { observer.error(error); return }
      operation.setContext({ hasRetriedAuth: true })
      subscription = forward(operation).subscribe(observer)
    })
    return () => { active = false; subscription?.unsubscribe() }
  })
})

export const apolloClient = new ApolloClient({
  link: refreshLink.concat(authLink).concat(sessionGate).concat(httpLink),
  cache: new InMemoryCache(),
})
