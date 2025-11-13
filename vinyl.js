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
// NOTE: We now fetch initial data from the uploaded JSON file path
const DATA_PATH = '/assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Set Firebase logging level (Useful for debugging)
setLogLevel('debug');


/**
 * Helper function to show a styled message in the message box.
 * @param {HTMLElement} messageBox The message box element.
 * @param {string} message The text message to display.
 * @param {'success'|'error'|'info'} type The type of message (determines color).
 */
function showMessage(messageBox, message, type) {
    if (!messageBox) return; // Defensive check

    // Determine Tailwind classes based on message type
    let baseClasses = 'p-3 rounded-lg shadow-xl transition-all duration-300 ease-in-out';
    let typeClasses = '';

    switch (type) {
        case 'success':
            typeClasses = 'bg-green-500 text-white';
            break;
        case 'error':
            typeClasses = 'bg-red-600 text-white';
            break;
        case 'info':
        default:
            typeClasses = 'bg-yellow-500 text-gray-900';
            break;
    }

    messageBox.className = `message-box fixed top-4 right-4 z-50 ${baseClasses} ${typeClasses}`;
    messageBox.textContent = message;
    messageBox.style.display = 'block';

    // Hide the message after 5 seconds
    setTimeout(() => {
        messageBox.style.display = 'none';
        // Reset classes to ensure no lingering styles
        messageBox.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl hidden';
    }, 5000);
}


/**
 * Toggles the visibility of the modal element.
 * @param {HTMLElement} modalElement The filter modal element.
 */
function toggleModal(modalElement) {
    if (modalElement.classList.contains('hidden')) {
        modalElement.classList.remove('hidden');
    } else {
        modalElement.classList.add('hidden');
    }
}


/**
 * Fetches the initial JSON collection data.
 * @returns {Promise<Array<Object>>} The array of vinyl records.
 */
async function fetchInitialCollection() {
    try {
        // Fetch the uploaded JSON file
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (e) {
        console.error("Could not fetch initial collection JSON:", e);
        // Fallback to empty array if fetch fails
        return []; 
    }
}


/**
 * Filters the record collection based on the current global filter state.
 * @param {Array<Object>} records The array of records to filter.
 * @returns {Array<Object>} The filtered array of records.
 */
function filterRecords(records) {
    return records.filter(record => {
        let matchesFormat = true;
        let matchesYear = true;

        // 1. Format Filter
        if (currentFilters.format) {
            matchesFormat = record.format === currentFilters.format;
        }

        // 2. Year Filter
        const year = parseInt(record.original_release_year, 10);
        
        if (currentFilters.yearFrom !== null && !isNaN(currentFilters.yearFrom)) {
            matchesYear = matchesYear && year >= currentFilters.yearFrom;
        }
        
        if (currentFilters.yearTo !== null && !isNaN(currentFilters.yearTo)) {
            matchesYear = matchesYear && year <= currentFilters.yearTo;
        }

        return matchesFormat && matchesYear;
    });
}


/**
 * Handles the search/filter operation and re-renders the display.
 * @param {string} searchTerm The text to search for.
 * @param {HTMLElement} recordsContainer The container to render cards into.
 * @param {boolean} applyFilters Flag to indicate if filters should be applied (default is true).
 */
function handleSearch(searchTerm, recordsContainer, applyFilters = true) {
    const term = searchTerm.toLowerCase().trim();
    let filteredList = allRecords;

    if (applyFilters) {
        filteredList = filterRecords(filteredList);
    }
    
    // Apply text search on the filtered list
    const searchResults = filteredList.filter(record => 
        record.artist.toLowerCase().includes(term) || 
        record.title.toLowerCase().includes(term)
    );

    renderRecords(searchResults, recordsContainer);
}


/**
 * Updates the global filter state.
 * @param {string} key The filter key ('format', 'yearFrom', 'yearTo').
 * @param {string|number|null} value The new value for the filter.
 */
function updateFilterState(key, value) {
    currentFilters = {
        ...currentFilters,
        [key]: value
    };
    // The actual filtering happens when the 'Apply Filters' button is clicked
}


// =================================================================
// 2. CORE DISPLAY LOGIC
// =================================================================

/**
 * Creates the HTML element for a single vinyl record card.
 * @param {Object} record The record data object.
 * @returns {string} The HTML string for the card.
 */
function createRecordCard(record) {
    // Determine the cover image URL (placeholder is used)
    const imageWidth = 200;
    const imageHeight = 200;
    const placeholderColor = record.id % 2 === 0 ? '00ADB5' : 'B87333';
    const imageUrl = `https://placehold.co/${imageWidth}x${imageHeight}/${placeholderColor}/E0E0E0?text=${record.artist[0] + record.title[0]}`;
    
    // Determine value class (for visual cue)
    let valueClass = 'bg-gray-400';
    if (record.estimated_value_high >= 40) {
        valueClass = 'bg-[var(--color-value-high)]'; // Red
    } else if (record.estimated_value_high >= 25) {
        valueClass = 'bg-[var(--color-value-mid)]'; // Amber
    } else {
        valueClass = 'bg-[var(--color-value-low)]'; // Green
    }

    return `
        <div class="album-card group shadow-lg">
            <div class="relative">
                <img src="${imageUrl}" alt="${record.artist} - ${record.title}" class="w-full h-auto object-cover rounded-t-lg">
                <div class="absolute top-2 left-2 px-2 py-1 text-xs font-semibold text-gray-900 rounded-full ${valueClass}">
                    $${record.estimated_value_low.toFixed(2)} - $${record.estimated_value_high.toFixed(2)}
                </div>
            </div>
            <div class="p-3">
                <h3 class="text-lg font-heading font-bold text-[var(--color-text-primary)] truncate">${record.title}</h3>
                <p class="text-sm text-[var(--color-text-secondary)] mb-2 truncate">${record.artist}</p>
                <div class="text-xs text-[var(--color-text-secondary)]">
                    <span class="font-bold text-[var(--color-accent-teal)]">${record.original_release_year}</span> &middot; 
                    ${record.label}
                </div>
            </div>
        </div>
    `;
}


/**
 * Renders the array of records into the container element.
 * @param {Array<Object>} records The array of records to render.
 * @param {HTMLElement} container The container to render cards into.
 */
function renderRecords(records, container) {
    container.innerHTML = records.map(createRecordCard).join('');

    // Update the counter in the header (if it exists)
    const recordCountElement = document.getElementById('record-count');
    if (recordCountElement) {
        recordCountElement.textContent = `(${records.length} records displayed)`;
    }
}


// =================================================================
// 3. FIREBASE AND APP INITIALIZATION
// =================================================================

/**
 * Initializes Firebase Authentication and Firestore.
 */
async function initFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Use custom token if provided, otherwise sign in anonymously
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
        
        // Set up Auth State listener to capture the user ID
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
            } else {
                userId = crypto.randomUUID(); // Fallback ID for non-authenticated states
            }
            isAuthReady = true;
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        // This is not a fatal app error, but Firestore features will be disabled.
    }
}


/**
 * Sets up a real-time listener for the user's private collection.
 * This function also loads the initial JSON data first.
 * @param {HTMLElement} recordsContainer The container to render cards into.
 * @param {HTMLElement} messageBox The message box element.
 */
async function startDataListener(recordsContainer, messageBox) {
    // 1. Load initial data from JSON
    const initialCollection = await fetchInitialCollection();
    // Use an anonymous ID temporarily if Firebase isn't fully ready
    userId = userId || crypto.randomUUID(); 

    // 2. Load Firestore data once auth is ready
    const loadFirestoreData = () => {
        if (!db || !userId) {
            // If Firebase or auth failed, just use the initial collection
            allRecords = initialCollection;
            renderRecords(allRecords, recordsContainer);
            return;
        }

        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        const q = query(recordsRef);

        // onSnapshot listens to real-time changes
        onSnapshot(q, (snapshot) => {
            let firestoreRecords = [];
            snapshot.forEach((doc) => {
                firestoreRecords.push({ id: doc.id, ...doc.data() });
            });

            // Combine initial data and Firestore data (prioritizing Firestore for updates/deletions)
            const combinedRecords = new Map();

            // 1. Add Firestore records
            firestoreRecords.forEach(record => combinedRecords.set(record.id, record));

            // 2. Add initial records, but only if they don't already exist in Firestore (i.e., not yet saved)
            initialCollection.forEach(record => {
                if (!combinedRecords.has(record.id.toString())) { // Ensure ID match
                    combinedRecords.set(record.id.toString(), record);
                }
            });

            allRecords = Array.from(combinedRecords.values());
            
            // Re-run search/filter to update the display
            const searchInput = document.getElementById('search-input');
            handleSearch(searchInput ? searchInput.value : '', recordsContainer);

            showMessage(messageBox, `Collection updated! Found ${allRecords.length} total records.`, 'info');

        }, (error) => {
            showMessage(messageBox, `Error listening to collection: ${error.message}`, 'error');
            console.error("Firestore onSnapshot error:", error);
        });
    };

    // Wait for the authentication state to be fully resolved
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        // This runs when Firebase has finished its initial check
        userId = user ? user.uid : crypto.randomUUID();
        isAuthReady = true;
        loadFirestoreData();
        unsubscribeAuth(); // Stop listening after the first time
    });
}

/**
 * Applies the filter settings from the modal and closes it.
 * @param {HTMLElement} filterModal The filter modal element.
 * @param {HTMLElement} recordsContainer The container to render cards into.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} applyFilterButton The button to disable temporarily.
 */
function applyFilter(filterModal, recordsContainer, messageBox, applyFilterButton) {
    applyFilterButton.disabled = true;
    
    // Get latest values from DOM inputs (in case the 'input' event was missed)
    const filterFormatSelect = document.getElementById('filter-format-select');
    const filterYearFrom = document.getElementById('filter-year-from');
    const filterYearTo = document.getElementById('filter-year-to');

    if (filterFormatSelect) updateFilterState('format', filterFormatSelect.value);
    if (filterYearFrom) updateFilterState('yearFrom', parseInt(filterYearFrom.value) || null);
    if (filterYearTo) updateFilterState('yearTo', parseInt(filterYearTo.value) || null);
    
    // Re-run search (which now includes filtering)
    const searchInput = document.getElementById('search-input');
    handleSearch(searchInput ? searchInput.value : '', recordsContainer);

    toggleModal(filterModal);
    showMessage(messageBox, 'Filters applied successfully!', 'success');
    
    setTimeout(() => { applyFilterButton.disabled = false; }, 500);
}

/**
 * Resets the filter state and the modal input fields.
 * @param {HTMLElement} filterModal The filter modal element.
 * @param {HTMLElement} recordsContainer The container to render cards into.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} applyFilterButton The button to disable temporarily.
 */
function resetFilters(filterModal, recordsContainer, messageBox, applyFilterButton) {
    applyFilterButton.disabled = true;

    // Reset global state
    currentFilters = { format: '', yearFrom: null, yearTo: null };

    // Reset DOM inputs
    const filterFormatSelect = document.getElementById('filter-format-select');
    const filterYearFrom = document.getElementById('filter-year-from');
    const filterYearTo = document.getElementById('filter-year-to');
    
    if (filterFormatSelect) filterFormatSelect.value = '';
    if (filterYearFrom) filterYearFrom.value = '';
    if (filterYearTo) filterYearTo.value = '';

    // Re-run search/filter
    const searchInput = document.getElementById('search-input');
    handleSearch(searchInput ? searchInput.value : '', recordsContainer);

    toggleModal(filterModal);
    showMessage(messageBox, 'Filters reset to default.', 'info');
    
    setTimeout(() => { applyFilterButton.disabled = false; }, 500);
}


// =================================================================
// 4. MAIN APPLICATION START
// =================================================================

/**
 * Initializes the application, sets up Firebase, and attaches all event listeners.
 */
async function initApp() {
    const messageBox = document.getElementById('message-box');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // CRITICAL SAFETY CHECK: If these core elements are missing, the app cannot proceed.
    if (!messageBox || !loadingIndicator) {
        console.error('CRITICAL ERROR: message-box or loading-indicator elements not found in the DOM. Check index.html.');
        return; 
    }

    try {
        // 1. Show loading indicator
        loadingIndicator.style.display = 'flex';

        // 2. Get remaining necessary DOM elements
        const searchInput = document.getElementById('search-input');
        const filterBtn = document.getElementById('filter-btn');
        const recordsContainer = document.getElementById('records-container');
        const filterModal = document.getElementById('filter-modal');
        const closeModalButton = document.getElementById('close-modal-button');
        const applyFilterButton = document.getElementById('apply-filter-button');
        const resetFilterButton = document.getElementById('reset-filter-button');
        
        const filterFormatSelect = document.getElementById('filter-format-select');
        const filterYearFrom = document.getElementById('filter-year-from');
        const filterYearTo = document.getElementById('filter-year-to');


        // 3. Initialize Firebase
        await initFirebase();

        // 4. Start listening to the data (this handles initial data load and real-time updates)
        await startDataListener(recordsContainer, messageBox);

        // 5. Set up Event Listeners (Defensive checks added to prevent "null" errors)
        
        if (searchInput && recordsContainer) {
            searchInput.addEventListener('input', () => handleSearch(searchInput.value, recordsContainer));
        } else {
             console.warn('Search input not found. Search functionality disabled.');
        }

        if (filterBtn && filterModal) {
            filterBtn.addEventListener('click', () => toggleModal(filterModal));
        } else {
             console.warn('Filter button not found. Filter opening disabled.');
        }

        // Modal and Filter Listeners
        if (closeModalButton && filterModal && applyFilterButton && resetFilterButton) {
            closeModalButton.addEventListener('click', () => toggleModal(filterModal));
            
            // Close modal if user clicks on the backdrop
            filterModal.addEventListener('click', (e) => {
                if (e.target === filterModal) {
                    toggleModal(filterModal);
                }
            });

            // Pass all required elements to the handlers
            applyFilterButton.addEventListener('click', () => applyFilter(filterModal, recordsContainer, messageBox, applyFilterButton));
            resetFilterButton.addEventListener('click', () => resetFilters(filterModal, recordsContainer, messageBox, applyFilterButton));

            // Listeners for dynamic filter inputs
            if (filterFormatSelect) {
                 filterFormatSelect.addEventListener('change', (e) => updateFilterState('format', e.target.value));
            }
            if (filterYearFrom) {
                filterYearFrom.addEventListener('input', (e) => updateFilterState('yearFrom', parseInt(e.target.value) || null));
            }
            if (filterYearTo) {
                filterYearTo.addEventListener('input', (e) => updateFilterState('yearTo', parseInt(e.target.value) || null));
            }

        } else {
            console.warn('One or more filter modal elements are missing. Modal functionality disabled.');
        }
        
        // 6. Hide loading indicator after successful init
        loadingIndicator.style.display = 'none';

    } catch (error) {
        // FIX 7: Pass the messageBox element to showMessage
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
        // Safely hide loading indicator in case of error
        if (loadingIndicator) {
             loadingIndicator.style.display = 'none';
        }
        console.error('Initialization error:', error);
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
