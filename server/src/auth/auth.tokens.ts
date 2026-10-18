/**
 * Injection token for the better-auth instance (di-use-interfaces-tokens).
 * Lives in its own file so the guards and the module never import each other
 * just for the token (arch-avoid-circular-deps).
 */
export const AUTH = Symbol('AUTH');
