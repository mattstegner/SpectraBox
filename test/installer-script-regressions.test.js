const fs = require('fs');
const path = require('path');

describe('Installer Script Regressions', () => {
  const installerPath = path.join(
    __dirname,
    '..',
    'scripts',
    'spectrabox-kiosk-install-v2.sh'
  );

  test('desktop autologin flow keeps LightDM and autologin group in sync', () => {
    const script = fs.readFileSync(installerPath, 'utf8');

    expect(script).toContain('groupadd -f autologin');
    expect(script).toContain('usermod -aG autologin "$PI_USER"');
    expect(script).toContain(
      'ensure_lightdm_setting /etc/lightdm/lightdm.conf autologin-user "$PI_USER"'
    );
    expect(script).toContain(
      'ensure_lightdm_setting /etc/lightdm/lightdm.conf autologin-session "$SESSION_NAME"'
    );
    expect(script).toContain(
      "id -nG \"$PI_USER\" | tr ' ' '\\n' | grep -qx autologin"
    );
  });

  test('desktop autologin verification still requires graphical boot', () => {
    const script = fs.readFileSync(installerPath, 'utf8');

    expect(script).toContain('default_target="$(systemctl get-default 2>/dev/null || true)"');
    expect(script).toContain('if [[ "$default_target" != "graphical.target" ]]; then');
    expect(script).toContain("grep -Rhs '^[[:space:]]*autologin-session=' /etc/lightdm");
  });

  test('wayland boot flow skips raspi-config B4 and relies on session-aware autologin config', () => {
    const script = fs.readFileSync(installerPath, 'utf8');

    expect(script).toContain('if [[ "$DISPLAY_MODE" == "x11" ]]; then');
    expect(script).toContain('step "Applying raspi-config desktop autologin (B4) for X11"');
    expect(script).toContain(
      'step "Skipping raspi-config boot behaviour on Wayland; using session-aware autologin config"'
    );
  });

  test('apt operations keep locally modified conffiles during unattended installs', () => {
    const script = fs.readFileSync(installerPath, 'utf8');

    expect(script).toContain('-o Dpkg::Options::=--force-confdef');
    expect(script).toContain('-o Dpkg::Options::=--force-confold');
    expect(script).toContain('apt_get_safe upgrade -y');
    expect(script).toContain('apt_get_safe install -y "$BROWSER_PKG"');
  });
});
