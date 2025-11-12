// VETERAN CLASS NOTE: This script is organized into three main sections:
// 1. Setup & Utilities (Variables, Firebase, Helper Functions)
// 2. Core Display Logic (Fetching Data and Rendering Cards)
// 3. User Interaction (The Search and Filtering Functionality)
// 4. Firestore Integration (Listen and Save)
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
    onSnapshot, 
    setLogLevel,
    addDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// Global state variables
let db;
let auth;
let userId = null;
let allRecords = [];
let isAuthReady = false;
// Flag to track if we successfully initialized Firebase
let isFirebaseInitialized = false; 

// New global state for filtering
let currentFilters = {
    format: '',
    yearFrom: null,
    yearTo: null,
};


// Configuration and Paths
const COLLECTION_PATH = 'records'; 
// UPDATED: Using a leading slash for the path to make it absolute from the root.
const DATA_PATH = '/assets/json/initialcollection.json'; 

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
    messageBox.className = `message-box bg-opacity-90 p-3 rounded-lg shadow-lg ${type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500'} text-white text-sm`;
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

    // Safely handle potential missing value
    const rawValue = parseFloat(record.current_value);
    const value = isNaN(rawValue) ? 0 : rawValue;

    const valueColor = getValueColor(value);
    const formattedValue = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(value);

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
                <span>Year: ${record.release_year || 'N/A'}</span>
                <span>Format: ${record.format || 'N/A'}</span>
            </div>
        </div>
    `;

    // Add a simple click handler to show details (using the message box as a non-alert demo)
    card.addEventListener('click', () => {
        showMessage(messageBox, `Viewing details for: ${record.artist} - ${record.title} (Catalog: ${record.catalog_number || 'N/A'})`);
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
 * @param {HTMLElement} messageBox The message box element.
 */
async function fetchInitialData(messageBox) {
    try {
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            // Log warning when fetch fails, which is helpful if a 404 is happening
            console.warn(`[Data Load Failure] Could not find local data at ${DATA_PATH}. Status: ${response.status}`);
            throw new Error(`Failed to fetch initial data: ${response.statusText}`);
        }
        const data = await response.json();
        
        // --- Console log to confirm data load ---
        console.log(`[Data Load Success] Successfully loaded ${data.length} records from local JSON: ${DATA_PATH}`);
        // ---

        return data;
    } catch (error) {
        showMessage(messageBox, `Error loading local data: ${error.message}. Displaying placeholder data.`, 'error');
        // Return a small set of mock data as a last resort if even the JSON fails
        return [{
            id: "MOCK1",
            artist: "Placeholder",
            title: "Data Not Loaded",
            release_year: 2024,
            format: "LP",
            current_value: 0.00,
            catalog_number: "N/A"
        }];
    }
}

// =================================================================
// 3. USER INTERACTION
// =================================================================

/**
 * Toggles the visibility of any modal.
 * @param {HTMLElement} modal The modal container element.
 */
function toggleModal(modal) {
    modal.classList.toggle('hidden');
}


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
 * Reads the values from the filter modal, updates the global state, 
 * closes the modal, and re-renders the collection.
 * (Parameters shortened for brevity - relies on passed DOM elements)
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
    toggleModal(filterModal);

    // Re-render the collection with the new filters applied
    renderCollection(allRecords, recordGrid, noResultsMessage, messageBox, searchInput.value);
    
    // Show confirmation
    showMessage(messageBox, 'Filters applied successfully!', 'success');
}


/**
 * Clears all filter inputs and resets the global filter state.
 */
function resetFilters(filterFormat, filterYearFrom, filterYearTo, applyFilterButton) {
    // Clear inputs
    filterFormat.value = '';
    filterYearFrom.value = '';
    filterYearTo.value = '';
    
    // Clear global state and re-render by clicking the apply button
    applyFilterButton.click();
}

/**
 * Handles the submission of the Add New Record form.
 * @param {Event} event The form submission event.
 * @param {HTMLElement} addRecordModal The modal element.
 * @param {HTMLElement} messageBox The message box element.
 */
async function handleAddRecord(event, addRecordModal, messageBox) {
    event.preventDefault(); // Stop the default form submission

    if (!isFirebaseInitialized || !db) {
        showMessage(messageBox, 'Cannot save: Real-time database is not initialized. Please ensure Firebase configuration is present.', 'error');
        return;
    }

    // 1. Get form data
    const form = event.target;
    const artist = form.elements['record-artist'].value.trim();
    const title = form.elements['record-title'].value.trim();
    const release_year_str = form.elements['record-year'].value.trim();
    const format = form.elements['record-format'].value;
    const current_value_str = form.elements['record-value'].value.trim();
    const catalog_number = form.elements['record-catalog'].value.trim() || 'N/A';

    // 2. Simple validation and type conversion
    if (!artist || !title || !release_year_str || !format) {
        showMessage(messageBox, 'Please fill in all required fields (Artist, Title, Year, Format).', 'error');
        return;
    }
    
    const release_year = parseInt(release_year_str);
    const current_value = parseFloat(current_value_str) || 0; // Default to 0 if empty or invalid

    if (isNaN(release_year)) {
        showMessage(messageBox, 'Release Year must be a valid number.', 'error');
        return;
    }
    
    // 3. Construct the record object
    const newRecord = {
        artist: artist,
        title: title,
        release_year: release_year,
        format: format,
        current_value: current_value,
        catalog_number: catalog_number,
        timestamp: new Date().toISOString() // Add timestamp for sorting
    };

    // 4. Save to Firestore
    await saveRecord(newRecord, messageBox);

    // 5. Reset and close
    form.reset();
    toggleModal(addRecordModal);
}


// =================================================================
// 4. FIRESTORE INTEGRATION (Listen for Real-time Data)
// =================================================================

/**
 * Sets up a real-time listener for the user's collection in Firestore.
 * (Parameters shortened for brevity - relies on passed DOM elements)
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
             // If Firestore has data, it overrides the initial JSON data
             allRecords = firestoreRecords;
             console.log(`Successfully loaded ${firestoreRecords.length} records from Firestore.`);
        } else if (allRecords.length > 1 || (allRecords.length === 1 && allRecords[0].id !== "MOCK1")) {
            // If Firestore is empty, but we loaded initial JSON data (and it wasn't the single mock fallback), we keep the initial data.
            console.log("Firestore collection is empty. Retaining initial JSON data.");
        } else {
            console.log("Firestore and initial JSON data are both empty or mock data.");
        }
        
        loadingIndicator.style.display = 'none';
        // Re-render based on whatever data source was chosen (Firestore, JSON, or mock)
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
 * Saves a new record to the user's private collection in Firestore.
 * @param {Object} record The record object to save.
 * @param {HTMLElement} messageBox The message box element.
 */
async function saveRecord(record, messageBox) {
    if (!isFirebaseInitialized || !db || !userId) {
        showMessage(messageBox, 'Cannot save: Real-time database is not initialized or user is not signed in.', 'error');
        return;
    }
    try {
        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        await addDoc(recordsRef, record);
        showMessage(messageBox, `Record for ${record.title} successfully saved to Firestore!`, 'success');
    } catch (e) {
        showMessage(messageBox, `Error adding document: ${e.message}`, 'error');
        console.error("Error adding document: ", e);
    }
}

/**
 * Initializes Firebase, authenticates, and starts the data listeners.
 */
async function initApp() {
    console.log("[INIT] Vinyl Archiver app initialization starting...");
    
    // 1. Define ALL DOM Element references
    const recordGrid = document.getElementById('record-grid');
    const searchInput = document.getElementById('search-input');
    const messageBox = document.getElementById('message-box');
    const userDisplay = document.getElementById('user-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const noResultsMessage = document.getElementById('no-results-message');
    
    // Filter Modal Elements
    const filterButton = document.getElementById('filter-button');
    const filterModal = document.getElementById('filter-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const applyFilterButton = document.getElementById('apply-filter-button');
    const resetFilterButton = document.getElementById('reset-filter-button');
    const filterFormat = document.getElementById('filter-format');
    const filterYearFrom = document.getElementById('filter-year-from');
    const filterYearTo = document.getElementById('filter-year-to');

    // Add Record Modal Elements
    const addRecordButton = document.getElementById('add-record-button');
    const addRecordModal = document.getElementById('add-record-modal');
    const closeAddModalButton = document.getElementById('close-add-modal-button');
    const addRecordForm = document.getElementById('add-record-form');


    loadingIndicator.style.display = 'block';

    // 2. Load Initial Data (always load this first as a fallback)
    allRecords = await fetchInitialData(messageBox);

    // 3. GRACEFUL FALLBACK CHECK (Handles the missing config error)
    if (!firebaseConfig) {
        showMessage(messageBox, 
            'Firebase configuration is missing. Real-time database features are disabled. Displaying local data only.', 
            'error');
        userDisplay.textContent = 'Status: Database Disabled (Missing Config)';
        userDisplay.style.display = 'block';
        loadingIndicator.style.display = 'none';
        // Render the local data and exit the Firebase initialization block
        renderCollection(allRecords, recordGrid, noResultsMessage, messageBox);
    } else {
        // --- Firebase Initialization Block ---
        try {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            isFirebaseInitialized = true; // Set flag to true

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
                        loadingIndicator.style.display = 'none';
                    }
                }
            });
        } catch (error) {
            showMessage(messageBox, `Failed to initialize Firebase: ${error.message}. Real-time features disabled.`, 'error');
            loadingIndicator.style.display = 'none';
        }
    }


    // 4. Setup interaction listeners (These run regardless of Firebase status)
    searchInput.addEventListener('keyup', () => 
        handleSearch(searchInput, recordGrid, noResultsMessage, messageBox)
    );

    // Filter Modal Listeners
    filterButton.addEventListener('click', () => toggleModal(filterModal));
    closeModalButton.addEventListener('click', () => toggleModal(filterModal));
    filterModal.addEventListener('click', (e) => {
        // Close modal if user clicks outside the inner box
        if (e.target.id === 'filter-modal') {
            toggleModal(filterModal);
        }
    });
    
    applyFilterButton.addEventListener('click', () => 
        applyFilters(filterModal, filterFormat, filterYearFrom, filterYearTo, recordGrid, noResultsMessage, messageBox, searchInput)
    );
    
    resetFilterButton.addEventListener('click', () => 
        resetFilters(filterFormat, filterYearFrom, filterYearTo, applyFilterButton)
    );
    
    // NEW: Add Record Modal Listeners
    addRecordButton.addEventListener('click', () => toggleModal(addRecordModal));
    closeAddModalButton.addEventListener('click', () => toggleModal(addRecordModal));
    addRecordModal.addEventListener('click', (e) => {
        // Close modal if user clicks outside the inner box
        if (e.target.id === 'add-record-modal') {
            toggleModal(addRecordModal);
        }
    });
    
    // NEW: Form Submission Listener
    addRecordForm.addEventListener('submit', (event) => 
        handleAddRecord(event, addRecordModal, messageBox)
    );
}

// Start the application when the window loads
window.onload = initApp;

// =================================================================
// 5. FIRESTORE SAVE FUNCTION
// This function demonstrates how data is saved to Firestore.
// =================================================================
// (The saveRecord function definition is included above in section 4)
