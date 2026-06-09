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

describe('Raspberry Pi OS Trixie Installer', () => {
  const installerPath = path.join(
    __dirname,
    '..',
    'scripts',
    'spectrabox-kiosk-install-trixie.sh'
  );

  let script;

  beforeAll(() => {
    script = fs.readFileSync(installerPath, 'utf8');
  });

  test('rejects unsupported operating systems and non-desktop images', () => {
    expect(script).toContain('if [[ "$os_version" != "13" || "$os_codename" != "trixie" ]]');
    expect(script).toContain('if ! command -v labwc');
    expect(script).toContain('/usr/share/wayland-sessions/rpd-labwc.desktop');
    expect(script).toContain('Debian Trixie alone is not supported');
  });

  test('rejects root, missing users, unrelated repositories, and dirty clones', () => {
    expect(script).toContain('if [[ "$PI_USER" == "root" ]]');
    expect(script).toContain('if ! id "$PI_USER"');
    expect(script).toContain('is not the SpectraBox repository');
    expect(script).toContain(
      'run_as_user git -C "$APP_DIR" status --porcelain --untracked-files=normal'
    );
    expect(script).toContain('has local changes or untracked files');
  });

  test('uses only Trixie distro packages and canonical TLS paths', () => {
    expect(script).toContain('nodejs');
    expect(script).toContain('npm');
    expect(script).toContain('chromium');
    expect(script).toContain('pipewire-audio');
    expect(script).toContain('wireplumber');
    expect(script).toContain('ssl/key.pem');
    expect(script).toContain('ssl/cert.pem');
    expect(script).not.toContain('nodesource.com');
    expect(script).not.toContain('firefox');
    expect(script).not.toContain('wayfire');
    expect(script).not.toContain('xdotool');
    expect(script).not.toContain('pulseaudio pulseaudio-utils');
  });

  test('configures the supported Trixie desktop interfaces', () => {
    expect(script).toContain('SUDO_USER="$PI_USER" raspi-config nonint do_wayland W2');
    expect(script).toContain(
      'SUDO_USER="$PI_USER" raspi-config nonint do_boot_behaviour B4'
    );
    expect(script).toContain('SUDO_USER="$PI_USER" raspi-config nonint do_blanking 1');
    expect(script).toContain('.config/labwc/autostart');
    expect(script).not.toContain('/etc/lightdm');
  });

  test('keeps repeated runs safe and prevents duplicate kiosk processes', () => {
    expect(script).toContain('git -C "$APP_DIR" pull --ff-only');
    expect(script).toContain('# BEGIN SPECTRABOX KIOSK');
    expect(script).toContain('flock -n 9 || exit 0');
    expect(script).toContain('pgrep -u "\\$(id -u)"');
    expect(script).toContain('must contain exactly one SpectraBox entry');
  });

  test('fails when the service, HTTPS health check, policy, or autostart verification fails', () => {
    expect(script).toContain('systemctl is-active --quiet "$SERVICE_NAME"');
    expect(script).toContain('"https://localhost:${PORT}/api/health"');
    expect(script).toContain('The Chromium audio capture policy is invalid');
    expect(script).toContain('labwc autostart must contain exactly one SpectraBox entry');
  });
});
