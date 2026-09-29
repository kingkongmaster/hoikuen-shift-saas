"""Hidden operator input. Child receives credentials only via stdin, never argv.
Target JSON contains target/approval metadata only. Command after -- is reviewed
local node or SSH/docker -i transport. Default performs dry-run only.
"""
import argparse, getpass, json, subprocess, sys, warnings

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', required=True)
    parser.add_argument('--execute-approved', action='store_true')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not sys.stdin.isatty() or not command or '--apply' in command or '--dry-run' in command:
        raise ValueError()
    with open(args.target, encoding='utf-8') as file:
        target = json.load(file)
    warnings.simplefilter('error', getpass.GetPassWarning)
    password = getpass.getpass('Temporary password (hidden): ')
    confirmation = getpass.getpass('Repeat temporary password (hidden): ')
    if password != confirmation:
        print('PASSWORD_MATCH_FAIL'); return 1
    payload = json.dumps({'target': target, 'password': password, 'confirmPassword': confirmation})
    for mode in (['--dry-run', '--apply'] if args.execute_approved else ['--dry-run']):
        result = subprocess.run(command + [mode], input=payload, text=True, capture_output=True)
        expected = 'RECOVERY_APPLY_PASS' if mode == '--apply' else 'RECOVERY_DRY_RUN_PASS'
        if result.returncode or result.stdout.strip() != expected or result.stderr:
            print('RECOVERY_HOLD: no automatic retry; inspect state read-only.'); return 1
        print(expected)
    return 0
if __name__ == '__main__':
    try: sys.exit(main())
    except (Exception, KeyboardInterrupt):
        print('RECOVERY_HOLD: safe input or execution failed; no automatic retry.'); sys.exit(1)
