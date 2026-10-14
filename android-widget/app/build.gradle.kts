plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "br.com.dmp.widget"
    compileSdk = 35
    buildToolsVersion = "35.0.0"
    defaultConfig { applicationId = "br.com.dmp.widget"; minSdk = 26; targetSdk = 35; versionCode = 6; versionName = "0.2.4" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { unitTests.isIncludeAndroidResources = true }
    kotlinOptions { jvmTarget = "17" }
}
dependencies { testImplementation("junit:junit:4.13.2"); testImplementation("org.robolectric:robolectric:4.14.1") }
