// VETERAN CLASS NOTE: This script is organized into three main sections:
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
    setLogLevel,
    addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;

// New global state for filtering
let currentFilters = {
    format: '',
    yearFrom: null,
    yearTo: null,
};


// Configuration and Paths
const COLLECTION_PATH = 'records'; 
const DATA_PATH = 'assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Set Firebase logging level (useful for debugging during development)
setLogLevel('debug');


/**
 * Shows a message on the UI instead of using alert()
 * FIX: Now requires the messageBox element to be passed, ensuring it is not null.
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
 * FIX: Now requires the messageBox element to be passed.
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
 * Renders the filtered list of records to the grid, applying both search and modal filters.
 * @param {Array<Object>} sourceRecords The array of records to start filtering from (usually allRecords).
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 * @param {HTMLElement} messageBox The message box element.
 * @param {string} searchTerm The current search input value (optional).
 */
function renderCollection(sourceRecords, recordGrid, noResultsMessage, messageBox, searchTerm = '') {
    // 1. Start with the full list
    let filteredRecords = sourceRecords;

    // 2. Apply Search Filter
    if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase().trim();
        filteredRecords = filteredRecords.filter(record => {
            const artist = record.artist ? record.artist.toLowerCase() : '';
            const title = record.title ? record.title.toLowerCase() : '';
            return artist.includes(lowerSearchTerm) || title.includes(lowerSearchTerm);
        });
    }

    // 3. Apply Modal Filters (currentFilters)
    filteredRecords = filteredRecords.filter(record => {
        // Format Filter
        if (currentFilters.format && record.format !== currentFilters.format) {
            return false;
        }

        // Year From Filter
        const recordYear = parseInt(record.release_year);
        if (currentFilters.yearFrom && recordYear < currentFilters.yearFrom) {
            return false;
        }

        // Year To Filter
        if (currentFilters.yearTo && recordYear > currentFilters.yearTo) {
            return false;
        }

        return true;
    });

    // 4. Render the final list
    recordGrid.innerHTML = '';
    if (filteredRecords.length === 0) {
        noResultsMessage.style.display = 'block';
        recordGrid.classList.add('hidden'); // Hide the grid if no results
        return;
    }
    noResultsMessage.style.display = 'none';
    recordGrid.classList.remove('hidden');

    filteredRecords.forEach(record => {
        recordGrid.appendChild(createRecordCard(record, messageBox));
    });
}

/**
 * Fetches the initial JSON data from the repository for the first load.
 * FIX: Now requires the messageBox element to be passed.
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
 * Triggers rendering with the current search term and filters.
 * @param {HTMLElement} searchInput The search input element.
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 * @param {HTMLElement} messageBox The message box element.
 */
function handleSearch(searchInput, recordGrid, noResultsMessage, messageBox) {
    const searchTerm = searchInput.value;
    // renderCollection now handles all filtering
    renderCollection(allRecords, recordGrid, noResultsMessage, messageBox, searchTerm);
}

/**
 * Toggles the visibility of the filter modal.
 * @param {HTMLElement} filterModal The modal container element.
 */
function toggleFilterModal(filterModal) {
    filterModal.classList.toggle('hidden');
}

/**
 * Reads the values from the filter modal, updates the global state, 
 * closes the modal, and re-renders the collection.
 * @param {HTMLElement} filterModal The modal container element.
 * @param {HTMLElement} filterFormat The format select input.
 * @param {HTMLElement} filterYearFrom The year from input.
 * @param {HTMLElement} filterYearTo The year to input.
 * @param {HTMLElement} recordGrid The grid container element.
 * @param {HTMLElement} noResultsMessage The no results message element.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} searchInput The search input element (to pass the search term).
 */
function applyFilters(filterModal, filterFormat, filterYearFrom, filterYearTo, recordGrid, noResultsMessage, messageBox, searchInput) {
    
    // Read and sanitize inputs
    currentFilters.format = filterFormat.value;
    
    // Parse years as numbers, defaulting to null if not entered
    const yearFrom = parseInt(filterYearFrom.value);
    currentFilters.yearFrom = isNaN(yearFrom) ? null : yearFrom;
    
    const yearTo = parseInt(filterYearTo.value);
    currentFilters.yearTo = isNaN(yearTo) ? null : yearTo;

    // Validate year range
    if (currentFilters.yearFrom && currentFilters.yearTo && currentFilters.yearFrom > currentFilters.yearTo) {
        showMessage(messageBox, 'The "Year From" cannot be after the "Year To". Please correct your range.', 'error');
        return; // Do not apply filter or close modal
    }

    // Close the modal
    toggleFilterModal(filterModal);

    // Re-render the collection with the new filters applied
    renderCollection(allRecords, recordGrid, noResultsMessage, messageBox, searchInput.value);
    
    // Show confirmation
    showMessage(messageBox, 'Filters applied successfully!', 'success');
}


/**
 * Clears all filter inputs and resets the global filter state.
 * @param {HTMLElement} filterFormat The format select input.
 * @param {HTMLElement} filterYearFrom The year from input.
 * @param {HTMLElement} filterYearTo The year to input.
 * @param {HTMLElement} applyFilterButton The apply button (used to force a re-render).
 */
function resetFilters(filterFormat, filterYearFrom, filterYearTo, applyFilterButton) {
    // Clear inputs
    filterFormat.value = '';
    filterYearFrom.value = '';
    filterYearTo.value = '';
    
    // Clear global state and re-render by clicking the apply button
    applyFilterButton.click();
}


// =================================================================
// 4. FIRESTORE INTEGRATION (Listen for Real-time Data)
// =================================================================

/**
 * Sets up a real-time listener for the user's collection in Firestore.
 * FIX: Now requires all display elements to be passed.
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
    // FIX 1: Define ALL DOM Element references here
    const recordGrid = document.getElementById('record-grid');
    const searchInput = document.getElementById('search-input');
    const messageBox = document.getElementById('message-box');
    const userDisplay = document.getElementById('user-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noResultsMessage = document.getElementById('no-results-message');
    
    // NEW Filter Modal Elements
    const filterButton = document.getElementById('filter-button');
    const filterModal = document.getElementById('filter-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const applyFilterButton = document.getElementById('apply-filter-button');
    const resetFilterButton = document.getElementById('reset-filter-button');
    const filterFormat = document.getElementById('filter-format');
    const filterYearFrom = document.getElementById('filter-year-from');
    const filterYearTo = document.getElementById('filter-year-to');


    if (!firebaseConfig) {
        // FIX 2: Pass the messageBox element to showMessage
        showMessage(messageBox, 'Error: Firebase configuration is missing.', 'error');
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // FIX 3: Pass the messageBox element to fetchInitialData
        allRecords = await fetchInitialData(messageBox);
        // Initial render without any filters
        renderCollection(allRecords, recordGrid, noResultsMessage, messageBox);
        loadingIndicator.style.display = 'block';

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userDisplay.textContent = `Current User ID: ${userId}`;
                userDisplay.style.display = 'block';
                isAuthReady = true;
                // FIX 4: Pass all display elements to the listener
                setupFirestoreListener(messageBox, loadingIndicator, recordGrid, noResultsMessage);
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch(e) {
                    // FIX 5: Pass the messageBox element to showMessage
                    showMessage(messageBox, `Authentication failed: ${e.message}`, 'error');
                }
            }
        });

        // Setup event listeners
        // FIX 6: Pass all necessary arguments to handleSearch
        searchInput.addEventListener('keyup', () => 
            handleSearch(searchInput, recordGrid, noResultsMessage, messageBox)
        );

        // NEW: Filter Modal Listeners
        filterButton.addEventListener('click', () => toggleFilterModal(filterModal));
        closeModalButton.addEventListener('click', () => toggleFilterModal(filterModal));
        filterModal.addEventListener('click', (e) => {
            // Close modal if user clicks outside the inner box
            if (e.target.id === 'filter-modal') {
                toggleFilterModal(filterModal);
            }
        });
        
        applyFilterButton.addEventListener('click', () => 
            applyFilters(filterModal, filterFormat, filterYearFrom, filterYearTo, recordGrid, noResultsMessage, messageBox, searchInput)
        );
        
        resetFilterButton.addEventListener('click', () => 
            resetFilters(filterFormat, filterYearFrom, filterYearTo, applyFilterButton)
        );


    } catch (error) {
        // FIX 7: Pass the messageBox element to showMessage
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
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
 * FIX: Now requires the messageBox element to be passed.
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
