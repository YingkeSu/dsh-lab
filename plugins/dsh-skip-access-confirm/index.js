/**
 * Host half of `dsh-skip-access-confirm`.
 *
 * The browser half does all the work; this host face exists only so the Loader
 * has a row whose package manifest the client-module scan can read.
 */

export const name = 'skip-access-confirm'

/** No host services are needed. */
export function apply() {}
