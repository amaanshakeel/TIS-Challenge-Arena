// This module deliberately has no DOM or CDN dependency, so its contracts are testable.
export function createAuthService(client) {
  return {
    async register(values, redirectUrl) {
      const { data, error } = await client.auth.signUp({
        email: values.email.trim().toLowerCase(), password: values.password,
        options: { emailRedirectTo: redirectUrl, data: {
          full_name: values.full_name.trim(), registration_number: values.registration_number.trim(),
          department: values.department.trim(), semester: Number(values.semester),
        } },
      });
      if (error) throw error;
      return data;
    },
    async login(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      return data;
    },
    async currentProfile() {
      // getUser validates the token with Auth; getSession alone is not authorization.
      const { data, error } = await client.auth.getUser();
      if (error) {
        if (['session_not_found','refresh_token_not_found','refresh_token_already_used','bad_jwt'].includes(error.code) || error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return null;
        throw error;
      }
      if (!data.user) return null;
      const result = await client.from('profiles').select('id,full_name,display_name,email,registration_number,department,semester,role,status,created_at').eq('id', data.user.id).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    async hasSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return Boolean(data.session);
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope:'local' });
      if (error) throw error;
    },
  };
}
