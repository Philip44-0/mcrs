/** The version of the skeleton API. A module's `mcrs` range has to include it. */
export const CORE_API_VERSION = '1.0.0';

/** The major version, which a client has to match to be able to talk to this server. */
export const CORE_API_MAJOR = CORE_API_VERSION.split('.')[0] as string;
