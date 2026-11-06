# WordPress Debugging

A VS Code sidebar for opening these files in the editor:

- `wp-config.php` in the WordPress installation root.
- `wp-content/debug.log` in the WordPress installation.

## Use

1. Open a theme folder, for example `/sites/example/wp-content/themes/my-theme`.
2. Select **WordPress Debugging** in the Activity Bar.
3. Expand the workspace folder and click a debug file.

The extension walks up from each open workspace folder until it finds a
`wp-content` directory, `wp-config.php`, or `wp-load.php`. It also works when
the entire WordPress installation is open, with multiple workspace folders,
and with remote workspaces through VS Code's filesystem API.

Files outside the theme folder are opened directly, without adding the
WordPress installation to your workspace. Use the sidebar's **Refresh**
button after creating or removing files. Missing files are marked **not
found**; clicking one displays an error rather than creating it.

WordPress only creates `debug.log` when debug logging is enabled and something
is logged. This extension does not change your WordPress configuration.

The theme must be inside a WordPress installation accessible to VS Code.
A standalone theme checkout has no installation or log to discover.

## Development

Open this extension folder in VS Code and press **F5** to launch an Extension
Development Host. In that window, open your WordPress theme folder and test
the sidebar. No build step is needed.

Run syntax checks and automated tests with:

```sh
npm run check
npm test
```
