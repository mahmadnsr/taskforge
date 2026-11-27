import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { gql } from '@apollo/client'
import { useMutation } from '@apollo/client/react'
import { apolloClient } from '../lib/apollo'
import { AuthContext } from './authContext'
import {
  clearTokens,
  getRefreshToken,
  getSessionVersion,
  onSessionExpired,
  setTokens,
} from '../lib/auth-tokens'
import { getRefreshedUser, pendingRotatedToken, refreshSession } from '../lib/session-refresh'

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

const LOGOUT_MUTATION = gql`
  mutation Logout($input: RefreshTokenInput!) {
    logout(input: $input)
  }
`

export type AuthContextValue = {  user: User | null
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
  refreshAccessToken: () => Promise<boolean>
  sessionExpired: boolean
}


// Share one refresh request across StrictMode effect executions.
let restoreSessionPromise: Promise<User | null> | null = null
let restoreVersion = -1

function restoreSession(): Promise<User | null> {
  if (restoreSessionPromise && restoreVersion === getSessionVersion()) {
    return restoreSessionPromise
  }

  if (!getRefreshToken()) return Promise.resolve(null)
  const version = getSessionVersion()
  restoreVersion = version
  restoreSessionPromise = refreshSession(version).then(outcome => outcome === 'success' && getSessionVersion() === version ? getRefreshedUser() : null)
    .finally(() => { if (restoreVersion === version) restoreSessionPromise = null })

  return restoreSessionPromise
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  const [runLogin] = useMutation<LoginResult>(LOGIN_MUTATION)
  const [runRegister] = useMutation<RegisterResult>(REGISTER_MUTATION)
  const [runRegisterWithInvitation] =
    useMutation<RegisterWithInvitationResult>(
      REGISTER_WITH_INVITATION_MUTATION,
    )
  const [runLogout] = useMutation<LogoutResult>(LOGOUT_MUTATION)

  useEffect(() => {
    let active = true
    const version = getSessionVersion()

    void restoreSession()
      .then((payload) => {
        if (active && version === getSessionVersion()) {
          setUser(payload)
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

  useEffect(() => onSessionExpired(() => {
    setUser(null)
    setSessionExpired(true)
    void apolloClient.clearStore()
  }), [])

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
      setSessionExpired(false)

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
    const version = getSessionVersion()
    const refreshToken = getRefreshToken()
    const rotatedToken = pendingRotatedToken(version)
    clearTokens()
    const logoutVersion = getSessionVersion()
    setUser(null)
    setSessionExpired(false)
    await apolloClient.clearStore()

    try {
      const tokenToRevoke = await rotatedToken || refreshToken
      if (tokenToRevoke) {
        await runLogout({
          variables: {
            input: { refreshToken: tokenToRevoke },
          },
          fetchPolicy: 'no-cache',
        })
      }
    } finally {
      if (getSessionVersion() === logoutVersion) await apolloClient.clearStore()
    }
  }, [runLogout])

  const refreshAccessToken = useCallback(async () => {
    const version = getSessionVersion()
    const payload = await restoreSession()
    if (payload && version === getSessionVersion()) {
      setUser(payload)
      return true
    }
    return false
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      login,
      register,
      registerWithInvitation,
      logout,
      refreshAccessToken,
      sessionExpired,
    }),
    [
      user,
      isInitializing,
      login,
      register,
      registerWithInvitation,
      logout,
      refreshAccessToken,
      sessionExpired,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
