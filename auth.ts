import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.login = (profile as { login?: string }).login
        token.githubId = (profile as { id?: number }).id?.toString()
      }
      return token
    },
    session({ session, token }) {
      const user = session.user as { login?: string; githubId?: string }
      if (token.login) user.login = token.login as string
      if (token.githubId) user.githubId = token.githubId as string
      return session
    },
  },
})
