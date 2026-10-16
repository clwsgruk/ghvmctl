import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/ghvmctl@snapcrafters.io/extension.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export default class', 'class');

function fixture({desktop = false, fail = false} = {}) {
    const calls = [];
    const stream = {close: () => calls.push('close')};
    const capture = kind => {
        calls.push(kind);
        if (fail)
            throw new Error('Capture failed');
    };
    const context = {
        Extension: class {},
        global: {display: {focus_window: {get_window_type: () => desktop ? 1 : 0}}},
        Meta: {WindowType: {DESKTOP: 1}},
        GLib: {
            get_home_dir: () => '/home/ubuntu',
            build_filenamev: parts => parts.join('/'),
            Variant: class {},
        },
        Gio: {
            FileCreateFlags: {REPLACE_DESTINATION: 1},
            File: {new_for_path: path => ({replace: () => {
                calls.push(path);
                return stream;
            }})},
        },
        Shell: {Screenshot: class {
            async screenshot() {capture('screen');}
            async screenshot_window() {capture('window');}
        }},
    };
    const Screenshots = vm.runInNewContext(`${source}\nScreenshots;`, context);
    const invocation = {
        return_value: () => calls.push('success'),
        return_dbus_error: () => calls.push('error'),
    };
    return {extension: new Screenshots(), invocation, calls};
}

for (const [window, kind] of [[false, 'screen'], [true, 'window']]) {
    test(`${kind} capture writes only its fixed filename and closes before replying`, async () => {
        const f = fixture();
        await f.extension.CaptureAsync([window], f.invocation);
        assert.deepEqual(f.calls, [`/home/ubuntu/${kind}.png`, kind, 'close', 'success']);
    });
}

test('desktop focus is not accepted as an application window', async () => {
    const f = fixture({desktop: true});
    await f.extension.CaptureAsync([true], f.invocation);
    assert.deepEqual(f.calls, ['error']);
});

test('capture errors close the output and return a D-Bus error', async () => {
    const f = fixture({fail: true});
    await f.extension.CaptureAsync([false], f.invocation);
    assert.deepEqual(f.calls, ['/home/ubuntu/screen.png', 'screen', 'error', 'close']);
});
