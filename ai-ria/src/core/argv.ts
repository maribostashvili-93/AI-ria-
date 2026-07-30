/**
 * `npm run ria -- <args>` strips the `--` separator before handing the
 * arguments to the script. `pnpm run ria -- <args>` passes it through as a
 * literal first argument, which made every command with a required option fail
 * with "required option '--title <title>' not specified".
 *
 * Dropping a leading `--` makes both package managers behave the same. No
 * command here needs `--` to separate options from positionals, so nothing is
 * lost.
 */
export function normalizeArgv(argv: string[]): string[] {
  return argv[2] === "--" ? [...argv.slice(0, 2), ...argv.slice(3)] : argv;
}
