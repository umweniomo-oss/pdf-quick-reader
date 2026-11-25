# PDF Quick Reader

An offline-first Android PDF utility starter built with Vite, JavaScript, jsPDF, PDF.js and Capacitor.

## What is included

- Create a basic PDF from a title and text.
- Preview PDF pages inside the app.
- Open an existing PDF using the device file chooser.
- Navigate pages and zoom.
- On Android, write the PDF to the app cache and open the native share sheet so the user can save or share it.
- GitHub Actions workflow that builds a test/debug APK.

## Important behaviour

The Android build packages the web application and PDF libraries inside the APK. The app's core functions do not need GitHub Pages or an internet connection.

The first version uses a simple text-based PDF creator. It is a starter, not yet a full document designer. More fields, images, tables, headers, footers and templates can be added after the initial device test.

The save button uses Android's share sheet with a cached PDF file. The user can select an available destination such as Files or another compatible app. This avoids pretending that a browser download automatically saves into the public Downloads folder.

## Create the GitHub repository from a phone

1. Open https://github.com/new in your browser.
2. Repository name: `pdf-quick-reader`.
3. Choose Public or Private.
4. Do not add a README, .gitignore or licence (these are already in this project).
5. Create the repository.
6. Extract this ZIP on your phone.
7. Upload the contents of the `pdf-quick-reader` folder to the repository root. Make sure `.github/workflows/android-build.yml` is included. GitHub's web upload may hide dot-folders in some mobile file pickers; if that happens, use GitHub's web interface or GitHub app to add the workflow folder.

## Build your first APK

1. Push the files to the repository's `main` branch.
2. Open the repository on GitHub.
3. Open the **Actions** tab.
4. Select **Build Android APK**.
5. If asked, enable GitHub Actions.
6. Wait for the workflow to finish.
7. Open the successful workflow run.
8. Under **Artifacts**, download `pdf-quick-reader-debug-apk`.
9. Extract the artifact ZIP and install `app-debug.apk` on your Android device. You may need to allow installation from that source.

The workflow creates a debug APK for testing. It is not a Play Store release.

## Google Play AAB

Before Play Store publishing, we must create a signed release build, protect the signing keystore and passwords in GitHub Actions secrets, build an Android App Bundle (`.aab`), and test the release. Do not publish the debug APK.

## Local development (optional)

Requires Node.js and Android build tools:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
```

For later changes:

```bash
npm run build
npx cap sync android
```

## App identity

- Display name: PDF Quick Reader
- Android application ID: `com.uweniomo.pdfquickreader`

Choose the final application ID carefully before publishing. Google Play does not allow changing the package ID of an existing published app.
