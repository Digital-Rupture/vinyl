// NOTE: This script is organized into three main sections:
// 1. Setup & Utilities (Variables, Firebase, Helper Functions)
// 2. Core Display Logic (Fetching Data and Rendering Cards)
// 3. User Interaction (The Search Functionality)
// This structure helps with maintainability and debugging!

// =================================================================
// 1. SETUP & UTILITIES
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    query, 
    onSnapshot, 
    doc, 
    setLogLevel
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;

// DOM Element references
const recordGrid = document.getElementById('record-grid');
const searchInput = document.getElementById('search-input');
const messageBox = document.getElementById('message-box');
const userDisplay = document.getElementById('user-display');
const loadingIndicator = document.getElementById('loading-indicator');
const noResultsMessage = document.getElementById('no-results-message');

// Configuration and Paths
// NOTE: Since we are deploying to Cloudflare Pages, the paths are absolute from the root.
const COLLECTION_PATH = 'records'; 
const DATA_PATH = '/vynil/assets/json/initialcollection.json'; // Path for initial collection data

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Set Firebase logging level (useful for debugging during development)
setLogLevel('debug');


/**
 * Shows a message on the UI instead of using alert()
 * @param {string} message The message to display.
 * @param {string} type The type of message (e.g., 'error', 'success').
 */
function showMessage(message, type = 'info') {
    console.log(`[Message: ${type}] ${message}`);
    messageBox.textContent = message;
    messageBox.className = `message-box bg-opacity-90 p-3 rounded-lg shadow-lg ${type === 'error' ? 'bg-red-500' : 'bg-blue-500'} text-white text-sm`;
    messageBox.style.display = 'block';
    // Hide the message after a delay
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
}

/**
 * Utility function to determine color based on value (for the badge).
 * @param {number} value The current record value.
 * @returns {string} Tailwind CSS class for background color.
 */
function getValueColor(value) {
    if (value > 50) return 'bg-yellow-500';
    if (value > 20) return 'bg-green-500';
    return 'bg-gray-400';
}

/**
 * Generates an external image search URL for display purposes.
 * NOTE: This is a placeholder and may not always retrieve the correct image.
 * The best practice is to store images locally or use a dedicated API (like Discogs) asynchronously.
 * @param {string} artist The artist name.
 * @param {string} title The album title.
 * @returns {string} A placeholder image URL using the artist and title.
 */
function getExternalImageUrl(artist, title) {
    // Generate a simple text-based placeholder URL
    const text = encodeURIComponent(`${artist} - ${title}`);
    return `https://placehold.co/200x200/222/FFF?text=${text}&font=inter`;
}

// =================================================================
// 2. CORE DISPLAY LOGIC
// =================================================================

/**
 * Creates the HTML structure for a single record card.
 * @param {Object} record The record data object.
 * @returns {HTMLElement} The created card element.
 */
function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card bg-white rounded-xl shadow-xl overflow-hidden transform transition duration-300 hover:scale-[1.02] cursor-pointer';

    const valueColor = getValueColor(record.current_value);
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(record.current_value);

    // Use the external image URL function
    const imagePath = getExternalImageUrl(record.artist, record.title);

    card.innerHTML = `
        <div class="relative">
            <img src="${imagePath}" alt="${record.artist} - ${record.title} Album Cover" class="album-cover w-full h-48 object-cover" onerror="this.onerror=null;this.src='https://placehold.co/200x200/111/444?text=NO+COVER';">
            <span class="absolute top-2 right-2 ${valueColor} text-white text-xs font-bold px-3 py-1 rounded-full shadow-md transition duration-300 transform hover:scale-105">
                ${formattedValue}
            </span>
        </div>
        <div class="card-details p-4">
            <h3 class="text-lg font-bold text-gray-900 truncate">${record.title}</h3>
            <p class="text-sm text-gray-600 truncate mb-2">${record.artist}</p>
            <div class="flex justify-between text-xs text-gray-500 mt-2">
                <span>Year: ${record.release_year}</span>
                <span>Format: ${record.format}</span>
            </div>
        </div>
    `;

    // Add a simple click handler to show details (using the message box as a non-alert demo)
    card.addEventListener('click', () => {
        showMessage(`Viewing details for: ${record.artist} - ${record.title} (Catalog: ${record.catalog_number})`);
    });

    return card;
}

/**
 * Renders the filtered list of records to the grid.
 * @param {Array<Object>} recordsToRender The array of records to display.
 */
function renderCollection(recordsToRender) {
    recordGrid.innerHTML = '';
    if (recordsToRender.length === 0) {
        noResultsMessage.style.display = 'block';
        return;
    }
    noResultsMessage.style.display = 'none';
    recordsToRender.forEach(record => {
        recordGrid.appendChild(createRecordCard(record));
    });
}

/**
 * Fetches the initial JSON data from the repository for the first load.
 */
async function fetchInitialData() {
    try {
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            throw new Error(`Failed to fetch initial data: ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        showMessage(`Error loading local data: ${error.message}. This might be normal if running locally.`, 'error');
        return [];
    }
}

// =================================================================
// 3. USER INTERACTION
// =================================================================

/**
 * Filters the collection based on the search input value (Artist or Title).
 */
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();

    const filteredRecords = allRecords.filter(record => {
        const artist = record.artist ? record.artist.toLowerCase() : '';
        const title = record.title ? record.title.toLowerCase() : '';

        return artist.includes(searchTerm) || title.includes(searchTerm);
    });

    renderCollection(filteredRecords);
}

// =================================================================
// 4. FIRESTORE INTEGRATION (Listen for Real-time Data)
// =================================================================

/**
 * Sets up a real-time listener for the user's collection in Firestore.
 */
function setupFirestoreListener() {
    if (!db || !isAuthReady || !userId) {
        console.warn("Firestore not ready or user not authenticated. Skipping listener setup.");
        return;
    }

    // Path: /artifacts/{appId}/users/{userId}/records
    const userRecordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
    
    // onSnapshot provides real-time updates
    const unsubscribe = onSnapshot(userRecordsRef, (snapshot) => {
        const firestoreRecords = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Ensure data structure matches expected record object
            firestoreRecords.push({ id: doc.id, ...data });
        });

        // Use the Firestore data if available, otherwise fall back to local JSON data.
        if (firestoreRecords.length > 0) {
             console.log(`Successfully loaded ${firestoreRecords.length} records from Firestore.`);
             allRecords = firestoreRecords;
        } else {
             console.log("Firestore empty. Using initial local JSON data.");
             // If Firestore is empty, we fall back to the initial data,
             // but we should ideally prompt the user to upload it.
        }
        
        loadingIndicator.style.display = 'none';
        renderCollection(allRecords);

    }, (error) => {
        showMessage(`Error loading real-time data: ${error.message}`, 'error');
        console.error("Firestore listen error:", error);
        loadingIndicator.style.display = 'none';
        renderCollection(allRecords); // Attempt to render whatever data is currently held
    });

    // NOTE: In a multi-component app, you would return this unsubscribe function
    // to clean up the listener when the component is unmounted.
    return unsubscribe;
}

/**
 * Initializes Firebase, authenticates, and starts the data listeners.
 */
async function initApp() {
    if (!firebaseConfig) {
        showMessage('Error: Firebase configuration is missing.', 'error');
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Handle user authentication with the initial token or sign in anonymously
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userDisplay.textContent = `Current User ID: ${userId}`;
                userDisplay.style.display = 'block';
                isAuthReady = true;
                setupFirestoreListener();
            } else {
                // Initial sign-in attempt if token is present
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    // Fallback to anonymous sign-in if no token is available
                    await signInAnonymously(auth);
                }
            }
        });

        // Load the initial data first, in case Firestore is not yet populated
        allRecords = await fetchInitialData();
        renderCollection(allRecords);
        loadingIndicator.style.display = 'block';

        // Setup event listeners
        searchInput.addEventListener('keyup', handleSearch);

    } catch (error) {
        showMessage(`Failed to initialize application: ${error.message}`, 'error');
        loadingIndicator.style.display = 'none';
    }
}

// Start the application when the window loads
window.onload = initApp;

// =================================================================
// 5. SAMPLE FUNCTION TO SAVE DATA (For Future Upload Feature)
// This function demonstrates how data would be saved to Firestore.
// =================================================================

/**
 * Saves a new record to the user's private collection in Firestore.
 * @param {Object} record The record object to save.
 */
async function saveRecord(record) {
    if (!db || !userId) {
        showMessage('Database not ready or user not signed in.', 'error');
        return;
    }
    try {
        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        await addDoc(recordsRef, record);
        showMessage('Record successfully saved to Firestore!', 'success');
    } catch (e) {
        showMessage(`Error adding document: ${e.message}`, 'error');
        console.error("Error adding document: ", e);
    }
}

// Example usage (uncomment and call this function to test saving data):
/*
// saveRecord({
//     artist: "Test Artist",
//     title: "Test Album",
//     current_value: 30.00,
//     release_year: 2024,
//     format: "LP"
// });
*/
