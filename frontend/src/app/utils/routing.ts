/** Default landing route after sign-in, by role. */
export function getHomeRoute(role: string): string {
  switch (role) {
    case 'admin':
      return '/today';
    case 'supervisor':
      return '/today';
    default:
      return '/today';
  }
}
