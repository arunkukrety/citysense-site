#include <esp32cam.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// WiFi credentials
#define WIFI_SSID "CMF BY NOTHING Phone 1_7212"
#define WIFI_PASSWORD "nothingCMF"

// Supabase configuration
#define SUPABASE_URL "https://hwdgxxadmeosgfwruvvp.supabase.co"
#define SUPABASE_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZGd4eGFkbWVvc2dmd3J1dnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1ODIzNDQsImV4cCI6MjA1ODE1ODM0NH0.g62bMcCwkt1K7Io24fY8JLGsV93dT-ytuPgVJ5o8gug"
#define SUPABASE_BUCKET "raw-images"

// MQ-135 sensor pin
#define MQ135_PIN 13

// LED pin
#define LED_PIN 4

// Capture interval (in milliseconds)
#define CAPTURE_INTERVAL 5000  // Increased to 15 seconds for stability

// Lowest possible configuration to save power
#define USE_LOWEST_RESOLUTION true  // Set to true for lowest resolution (QQVGA)
#define ENABLE_WIFI true           // Set to false for camera-only testing

unsigned long lastCaptureTime = 0;
bool cameraInitialized = false;
int imageCount = 0;

// Function to read MQ-135 sensor
float readMQ135() {
  int sensorValue = analogRead(MQ135_PIN);
  return sensorValue;
}

bool uploadToSupabase(uint8_t* imageData, size_t imageSize) {
  if (!ENABLE_WIFI) {
    Serial.println("WiFi disabled, skipping upload");
    return true;
  }
  
  bool success = false;
  
  // Only proceed if we have WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping upload");
    return false;
  }

  // 1. Upload image to Supabase Storage (if we have image data)
  String imageUrl = "";
  
  if (imageData != nullptr && imageSize > 0) {
    String imageName = "img_" + String(millis()) + ".jpg";
    String uploadUrl = String(SUPABASE_URL) + "/storage/v1/object/" + SUPABASE_BUCKET + "/" + imageName;
    
    Serial.println("Uploading to URL: " + uploadUrl);
    
    HTTPClient http;
    http.begin(uploadUrl);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
    http.addHeader("Content-Type", "image/jpeg");
    
    int httpResponseCode = http.POST(imageData, imageSize);
    
    if (httpResponseCode == 200 || httpResponseCode == 201) {
      imageUrl = String(SUPABASE_URL) + "/storage/v1/object/public/" + SUPABASE_BUCKET + "/" + imageName;
      Serial.println("Image uploaded successfully!");
      Serial.println("Image URL: " + imageUrl);
    } else {
      Serial.print("Image upload failed, error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
    delay(100); // Short delay after HTTP operation
  }
  
  // 2. Insert data into raw_table
  float mq135Data = readMQ135();
  
  // Create smaller JSON document to save memory
  StaticJsonDocument<200> doc;
  
  doc["coordinates"] = "(40.7128,-74.0060)";
  doc["image_url"] = imageUrl;
  doc["mq135_data"] = mq135Data;
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  Serial.println("JSON payload: " + jsonPayload);
  
  // Send data to Supabase
  HTTPClient http;
  String tableUrl = String(SUPABASE_URL) + "/rest/v1/raw_table";
  
  Serial.println("Sending data to: " + tableUrl);
  
  http.begin(tableUrl);
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");
  
  int httpResponseCode = http.POST(jsonPayload);
  
  if (httpResponseCode == 201) {
    Serial.println("Data inserted successfully!");
    Serial.print("MQ-135 reading: ");
    Serial.println(mq135Data);
    success = true;
  } else {
    Serial.print("Data insertion failed, error: ");
    Serial.println(httpResponseCode);
  }
  http.end();
  delay(100); // Short delay after HTTP operation
  
  return success;
}

void captureAndUpload() {
  // Turn on LED
  digitalWrite(LED_PIN, HIGH);
  delay(50); // Very short LED flash to save power
  
  if (cameraInitialized) {
    // Try to capture image
    Serial.println("Capturing image...");
    
    auto img = esp32cam::capture();
    digitalWrite(LED_PIN, LOW); // Turn off LED immediately
    
    if (img == nullptr) {
      Serial.println("Failed to capture image");
      // Upload sensor data only
      uploadToSupabase(nullptr, 0);
    } else {
      Serial.print("Captured image #");
      Serial.print(++imageCount);
      Serial.print(" (");
      Serial.print(img->size());
      Serial.println(" bytes)");
      
      // Only attempt upload if WiFi is enabled
      if (ENABLE_WIFI) {
        uploadToSupabase(img->data(), img->size());
      } else {
        Serial.println("WiFi disabled, skipping upload");
      }
      
      // Free memory immediately
      img.reset();
    }
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("Camera not available");
    if (ENABLE_WIFI) {
      uploadToSupabase(nullptr, 0);
    }
  }
  
  // Debug memory
  Serial.print("Free heap after capture: ");
  Serial.println(ESP.getFreeHeap());
}

bool initCamera() {
  Serial.println("Initializing camera...");
  
  // Configure Camera with lowest possible resolution to reduce power draw
  esp32cam::Config cfg;
  cfg.setPins(esp32cam::pins::AiThinker);
  
  // Choose resolution based on configuration
  auto res = USE_LOWEST_RESOLUTION ? 
             esp32cam::Resolution::find(160, 120) :  // QQVGA - lowest resolution
             esp32cam::Resolution::find(320, 240);   // QVGA
             
  cfg.setResolution(res);
  cfg.setJpeg(60); // Lower quality (60%)
  cfg.setBufferCount(1);
  
  // Try to initialize the camera
  if (esp32cam::Camera.begin(cfg)) {
    Serial.println("Camera initialized successfully!");
    return true;
  } else {
    Serial.println("Camera initialization failed!");
    return false;
  }
}

void setup() {
  Serial.begin(115200);
  delay(3000); // Longer delay to stabilize
  
  Serial.println("\n\n----- ESP32-CAM Starting -----");
  Serial.print("Free heap at start: ");
  Serial.println(ESP.getFreeHeap());
  
  // Initialize pins with minimal power usage
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(MQ135_PIN, INPUT);
  
  // Flash LED briefly to indicate startup
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  digitalWrite(LED_PIN, LOW);
  
  // Connect to WiFi only if enabled
  if (ENABLE_WIFI) {
    connectToWiFi();
  } else {
    Serial.println("WiFi disabled for power saving");
  }
  
  // Initialize camera
  cameraInitialized = initCamera();
  if (!cameraInitialized) {
    Serial.println("Failed to initialize camera");
  }
  
  // Allow MQ-135 sensor to warm up
  Serial.println("Warming up MQ-135 sensor...");
  delay(1000); // Shorter warmup
  Serial.println("Sensor ready!");
  
  Serial.print("Free heap after setup: ");
  Serial.println(ESP.getFreeHeap());
  
  Serial.print("System ready! Capture interval: ");
  Serial.print(CAPTURE_INTERVAL / 1000);
  Serial.println(" seconds");
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.persistent(false);      // Don't save WiFi settings to flash
  WiFi.mode(WIFI_STA);         // Set station mode
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 20) {
    delay(500);
    Serial.print(".");
    timeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("Connected to WiFi, IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect to WiFi. Will retry in loop.");
  }
}

void loop() {
  unsigned long currentTime = millis();
  
  // Check WiFi connection and reconnect if needed (only if enabled)
  if (ENABLE_WIFI && WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    connectToWiFi();
  }
  
  // Capture and upload at the specified interval
  if (currentTime - lastCaptureTime >= CAPTURE_INTERVAL) {
    lastCaptureTime = currentTime;
    captureAndUpload();
    
    // Add longer delay after capture to let system stabilize
    delay(500);
  }
  
  // Periodically try to reinitialize camera if it failed
  if (!cameraInitialized && (currentTime % 60000 == 0)) {
    Serial.println("Attempting to reinitialize camera...");
    cameraInitialized = initCamera();
  }
  
  // Minimal loop delay to avoid consuming power
  delay(100);
}