import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const NAME = 'io.snapcrafters.ghvmctl.Screenshot';
const PATH = '/io/snapcrafters/ghvmctl/Screenshot';
const XML = `<node><interface name="${NAME}">
    <method name="Capture"><arg type="b" name="window" direction="in"/></method>
</interface></node>`;

// Only installed in disposable test VMs. No global unsafe mode is enabled.
export default class Screenshots extends Extension {
    enable() {
        this._object = Gio.DBusExportedObject.wrapJSObject(XML, this);
        this._object.export(Gio.DBus.session, PATH);
        this._name = Gio.bus_own_name_on_connection(
            Gio.DBus.session, NAME, Gio.BusNameOwnerFlags.NONE, null, null);
    }

    disable() {
        Gio.bus_unown_name(this._name);
        this._object.unexport();
        this._object = null;
    }

    async CaptureAsync([window], invocation) {
        let stream;
        try {
            const focus = global.display.focus_window;
            if (window && (!focus || focus.get_window_type() === Meta.WindowType.DESKTOP))
                throw new Error('No active application window');
            const filename = window ? 'window.png' : 'screen.png';
            const file = Gio.File.new_for_path(
                GLib.build_filenamev([GLib.get_home_dir(), filename]));
            stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const screenshot = new Shell.Screenshot();
            if (window)
                await screenshot.screenshot_window(true, false, stream);
            else
                await screenshot.screenshot(false, stream);
            stream.close(null);
            stream = null;
            invocation.return_value(new GLib.Variant('()', []));
        } catch (error) {
            invocation.return_dbus_error(`${NAME}.Failed`, error.message);
        } finally {
            stream?.close(null);
        }
    }
}
