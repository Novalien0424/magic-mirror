import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export function ravenButtonMapping(address) {
  if (typeof address !== 'string' || !/^[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}$/i.test(address)) throw Error('observed_bluetooth_device_address_required')
  return { title: 'Raven device-scoped button', rules: [{ description: 'Raven: F13 push starts, F14 hold stops', manipulators:
    [['f13', 'start'], ['f14', 'stop']].map(([key_code, action]) => ({ type: 'basic', from: { key_code, modifiers: { optional: ['any'] } },
      to: [{ shell_command: `/bin/zsh /Users/novalien0424/magic-mirror/deploy/macos/raven-button.sh ${action}`, repeat: false }],
      conditions: [{ type: 'device_if', identifiers: [{ device_address: address }] }] })) }] }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(ravenButtonMapping(process.argv[2]), null, 2) + '\n')
}
