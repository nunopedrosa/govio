# App-owned publication contract; common engine: BaseCentral deploy 1.0.0.
APP_ID=govio
SOURCE_SUBDIR=.
DEFAULT_DESTINATION="${DEPLOY_SITE:-$HOME/vio.basecentral.link}"
DEPLOY_URL=https://vio.basecentral.link
PUBLIC_FILES=$(cat <<'PUBLIC_FILES'
app.js
config.php
health.php
icons/apple-touch-icon.png
icons/camera-orange.png
icons/favicon-16.png
icons/favicon-32.png
icons/favicon.ico
icons/icon-192.png
icons/icon-512.png
index.php
manifest.webmanifest
shared-chevron.svg
shared-controls.css
shared-icons.svg
styles.css
sw.js
vendor/mediabunny/LICENSE-MPL-2.0.txt
vendor/mediabunny/NOTICE.txt
vendor/mediabunny/mediabunny-aac-encoder.min.js
vendor/mediabunny/mediabunny.min.cjs
PUBLIC_FILES
)

# Install the reviewed template only when the host has no .htaccess; preserve custom headers.
HEADER_TEMPLATE=.htaccess
