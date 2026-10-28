import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { gql } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { apolloClient } from '../lib/apollo'
import {
  clearTokens,
  getRefreshToken,
  setTokens,
} from '../lib/auth-tokens'

export type User = {
  id: string
  name: string
  email: string
}

type AuthPayload = {
  accessToken: string
  refreshToken: string
  user: User
}

type LoginResult = {
  login: AuthPayload
}

type RegisterResult = {
  register: User
}

type RegisterWithInvitationResult = {
  registerWithInvitation: User
}

type LogoutResult = {
  logout: boolean
}

type RefreshResult = {
  refresh: AuthPayload
}

const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user {
        id
        name
        email
      }
    }
  }
`

const REGISTER_MUTATION = gql`
  mutation Register($input: RegisterInput!) {
    register(input: $input) {
      id
      name
      email
    }
  }
`

const REGISTER_WITH_INVITATION_MUTATION = gql`
  mutation RegisterWithInvitation($input: RegisterWithInvitationInput!) {
    registerWithInvitation(input: $input) {
      id
      name
      email
    }
  }
`

const REFRESH_MUTATION = gql`
  mutation Refresh($input: RefreshTokenInput!) {
    refresh(input: $input) {
      accessToken
      refreshToken
      user {
        id
        name
        email
      }
    }
  }
`

const LOGOUT_MUTATION = gql`
  mutation Logout($input: RefreshTokenInput!) {
    logout(input: $input)
  }
`

type AuthContextValue = {
  user: User | null
  isAuthenticated: boolean
  isInitializing: boolean
  login: (email: string, password: string) => Promise<void>
  register: (
    name: string,
    email: string,
    password: string,
    organizationName: string,
  ) => Promise<void>
  registerWithInvitation: (
    name: string,
    email: string,
    password: string,
    invitationToken: string,
  ) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Share one refresh request across StrictMode effect executions.
let restoreSessionPromise: Promise<AuthPayload | null> | null = null

function restoreSession(): Promise<AuthPayload | null> {
  if (restoreSessionPromise) {
    return restoreSessionPromise
  }

  const refreshToken = getRefreshToken()

  if (!refreshToken) {
    return Promise.resolve(null)
  }

  restoreSessionPromise = apolloClient
    .mutate<RefreshResult>({
      mutation: REFRESH_MUTATION,
      variables: {
        input: { refreshToken },
      },
      fetchPolicy: 'no-cache',
    })
    .then(({ data }) => {
      const payload = data?.refresh

      if (!payload) {
        throw new Error('Session restoration failed.')
      }

      setTokens(payload.accessToken, payload.refreshToken)

      return payload
    })
    .catch(() => {
      clearTokens()
      return null
    })
    .finally(() => {
      restoreSessionPromise = null
    })

  return restoreSessionPromise
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const [runLogin] = useMutation<LoginResult>(LOGIN_MUTATION)
  const [runRegister] = useMutation<RegisterResult>(REGISTER_MUTATION)
  const [runRegisterWithInvitation] =
    useMutation<RegisterWithInvitationResult>(
      REGISTER_WITH_INVITATION_MUTATION,
    )
  const [runLogout] = useMutation<LogoutResult>(LOGOUT_MUTATION)

  useEffect(() => {
    let active = true

    void restoreSession()
      .then((payload) => {
        if (active) {
          setUser(payload?.user ?? null)
        }
      })
      .finally(() => {
        if (active) {
          setIsInitializing(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await runLogin({
        variables: {
          input: { email, password },
        },
        fetchPolicy: 'no-cache',
      })

      if (!data?.login) {
        throw new Error('Login failed. Please try again.')
      }

      setTokens(data.login.accessToken, data.login.refreshToken)
      setUser(data.login.user)

      await apolloClient.clearStore()
    },
    [runLogin],
  )

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      organizationName: string,
    ) => {
      const { data } = await runRegister({
        variables: {
          input: { name, email, password, organizationName },
        },
      })

      if (!data?.register) {
        throw new Error('Registration failed. Please try again.')
      }
    },
    [runRegister],
  )

  const registerWithInvitation = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      invitationToken: string,
    ) => {
      const { data } = await runRegisterWithInvitation({
        variables: {
          input: {
            name,
            email,
            password,
            invitationToken,
          },
        },
        fetchPolicy: 'no-cache',
      })

      if (!data?.registerWithInvitation) {
        throw new Error('Invitation registration failed. Please try again.')
      }
    },
    [runRegisterWithInvitation],
  )

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()

    try {
      if (refreshToken) {
        await runLogout({
          variables: {
            input: { refreshToken },
          },
          fetchPolicy: 'no-cache',
        })
      }
    } finally {
      clearTokens()
      setUser(null)
      await apolloClient.clearStore()
    }
  }, [runLogout])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      login,
      register,
      registerWithInvitation,
      logout,
    }),
    [
      user,
      isInitializing,
      login,
      register,
      registerWithInvitation,
      logout,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}