// VETERAN CLASS NOTE: This script is now located at /vynil/assets/js/app.js.
// The file's location has been updated to match the path structure your server requires.

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
    setLogLevel,
    addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;

// Configuration and Paths
const COLLECTION_PATH = 'records'; 
const DATA_PATH = '/vynil/assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Set Firebase logging level (useful for debugging during development)
setLogLevel('debug');


/**
 * Shows a message on the UI instead of using alert()
 * @param {HTMLElement} messageBox The DOM element for the message box.
 * @param {string} message The message to display.
 * @param {string} type The type of message (e.g., 'error', 'success').
 */
function showMessage(messageBox, message, type = 'info') {
    if (!messageBox) {
        console.error(`[Message: ${type}] UI message box not available: ${message}`);
        return;
    }
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
 * @param {HTMLElement} messageBox The DOM element for the message box.
 * @returns {HTMLElement} The created card element.
 */
function createRecordCard(record, messageBox) {
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
        showMessage(messageBox, `Viewing details for: ${record.artist} - ${record.title} (Catalog: ${record.catalog_number})`);
    });

    return card;
}

/**
 * Renders the filtered list of records to the grid.
 * @param {Array<Object>} recordsToRender The array of records to display.
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 * @param {HTMLElement} messageBox The message box element.
 */
function renderCollection(recordsToRender, recordGrid, noResultsMessage, messageBox) {
    recordGrid.innerHTML = '';
    if (recordsToRender.length === 0) {
        noResultsMessage.style.display = 'block';
        return;
    }
    noResultsMessage.style.display = 'none';
    recordsToRender.forEach(record => {
        recordGrid.appendChild(createRecordCard(record, messageBox));
    });
}

/**
 * Fetches the initial JSON data from the repository for the first load.
 * @param {HTMLElement} messageBox The message box element.
 */
async function fetchInitialData(messageBox) {
    try {
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            console.warn(`Could not find local data at ${DATA_PATH}. Status: ${response.status}`);
            throw new Error(`Failed to fetch initial data: ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        showMessage(messageBox, `Error loading local data: ${error.message}. This might be normal if running locally or if the file path is incorrect.`, 'error');
        return [];
    }
}

// =================================================================
// 3. USER INTERACTION
// =================================================================

/**
 * Filters the collection based on the search input value (Artist or Title).
 * @param {HTMLElement} searchInput The search input element.
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 * @param {HTMLElement} messageBox The message box element.
 */
function handleSearch(searchInput, recordGrid, noResultsMessage, messageBox) {
    const searchTerm = searchInput.value.toLowerCase().trim();

    const filteredRecords = allRecords.filter(record => {
        const artist = record.artist ? record.artist.toLowerCase() : '';
        const title = record.title ? record.title.toLowerCase() : '';

        return artist.includes(searchTerm) || title.includes(searchTerm);
    });

    renderCollection(filteredRecords, recordGrid, noResultsMessage, messageBox);
}

// =================================================================
// 4. FIRESTORE INTEGRATION (Listen for Real-time Data)
// =================================================================

/**
 * Sets up a real-time listener for the user's collection in Firestore.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} loadingIndicator The loading indicator element.
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 */
function setupFirestoreListener(messageBox, loadingIndicator, recordGrid, noResultsMessage) {
    if (!db || !isAuthReady || !userId) {
        console.warn("Firestore not ready or user not authenticated. Skipping listener setup.");
        return;
    }

    // Path: /artifacts/{appId}/users/{userId}/records
    const userRecordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
    
    const unsubscribe = onSnapshot(userRecordsRef, (snapshot) => {
        const firestoreRecords = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Ensure data structure matches expected record object
            firestoreRecords.push({ id: doc.id, ...data });
        });

        if (firestoreRecords.length > 0) {
             console.log(`Successfully loaded ${firestoreRecords.length} records from Firestore.`);
             allRecords = firestoreRecords;
        } else {
             console.log("Firestore collection is empty. Displaying initial JSON data.");
        }
        
        loadingIndicator.style.display = 'none';
        renderCollection(allRecords, recordGrid, noResultsMessage, messageBox);

    }, (error) => {
        showMessage(messageBox, `Error loading real-time data: ${error.message}`, 'error');
        console.error("Firestore listen error:", error);
        loadingIndicator.style.display = 'none';
        renderCollection(allRecords, recordGrid, noResultsMessage, messageBox); 
    });

    return unsubscribe;
}

/**
 * Initializes Firebase, authenticates, and starts the data listeners.
 */
async function initApp() {
    // Define DOM Element references here, after window.onload ensures they exist.
    const recordGrid = document.getElementById('record-grid');
    const searchInput = document.getElementById('search-input');
    const messageBox = document.getElementById('message-box');
    const userDisplay = document.getElementById('user-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noResultsMessage = document.getElementById('no-results-message');

    if (!firebaseConfig) {
        showMessage(messageBox, 'Error: Firebase configuration is missing.', 'error');
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        allRecords = await fetchInitialData(messageBox);
        renderCollection(allRecords, recordGrid, noResultsMessage, messageBox);
        loadingIndicator.style.display = 'block';

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userDisplay.textContent = `Current User ID: ${userId}`;
                userDisplay.style.display = 'block';
                isAuthReady = true;
                setupFirestoreListener(messageBox, loadingIndicator, recordGrid, noResultsMessage);
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch(e) {
                    showMessage(messageBox, `Authentication failed: ${e.message}`, 'error');
                }
            }
        });

        // Setup event listeners
        searchInput.addEventListener('keyup', () => 
            handleSearch(searchInput, recordGrid, noResultsMessage, messageBox)
        );

    } catch (error) {
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
        loadingIndicator.style.display = 'none';
    }
}

// Start the application when the window loads
window.onload = initApp;

// =================================================================
// 5. SAMPLE FUNCTION TO SAVE DATA (For Future Upload Feature)
// =================================================================

/**
 * Saves a new record to the user's private collection in Firestore.
 * @param {Object} record The record object to save.
 * @param {HTMLElement} messageBox The message box element.
 */
async function saveRecord(record, messageBox) {
    if (!db || !userId) {
        showMessage(messageBox, 'Database not ready or user not signed in.', 'error');
        return;
    }
    try {
        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        await addDoc(recordsRef, record);
        showMessage(messageBox, 'Record successfully saved to Firestore!', 'success');
    } catch (e) {
        showMessage(messageBox, `Error adding document: ${e.message}`, 'error');
        console.error("Error adding document: ", e);
    }
}
