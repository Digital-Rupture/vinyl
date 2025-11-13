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
const DATA_PATH = '/assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Set Firebase log level for debugging
setLogLevel('Debug');

/**
 * Helper to get the correct image URL (placeholder if none)
 * @param {Object} record The record object.
 * @returns {string} The image URL.
 */
function getImageUrl(record) {
    // Note: In a real app, this would point to Firebase Storage.
    // We use a placeholder image URL template for now.
    const imageText = `${record.artist.split(' ')[0]} ${record.title.split(' ')[0]}`;
    return `https://placehold.co/150x150/262626/E0E0E0?text=${encodeURIComponent(imageText)}`;
}

/**
 * Calculates a color class based on the estimated value range.
 * This determines the visual indicator on the card.
 * @param {Object} record The record object with value properties.
 * @returns {string} The Tailwind background class.
 */
function getValueClass(record) {
    // Midpoint calculation for a rough indicator
    const midpoint = (record.estimated_value_low + record.estimated_value_high) / 2;

    if (midpoint >= 40) {
        return 'bg-red-600'; // High Value
    } else if (midpoint >= 20) {
        return 'bg-yellow-500'; // Mid Value
    } else {
        return 'bg-green-600'; // Low Value
    }
}


/**
 * Displays a non-blocking toast/message notification.
 * @param {HTMLElement} element The message box DOM element.
 * @param {string} message The message to display.
 * @param {'success' | 'error' | 'info'} type The type of message.
 */
function showMessage(element, message, type) {
    // Determine classes and delay based on type
    let classes = '';
    let delay = 3000;

    switch (type) {
        case 'success':
            classes = 'bg-green-600 text-white';
            break;
        case 'error':
            classes = 'bg-red-600 text-white';
            delay = 5000;
            break;
        case 'info':
        default:
            classes = 'bg-blue-600 text-white';
            break;
    }

    // Set message content
    element.textContent = message;

    // Remove existing type classes (more precise removal to prevent conflicts)
    element.classList.remove('bg-green-600', 'bg-red-600', 'bg-blue-600', 'text-white');

    // FIX: Split the classes string by space and use the spread operator 
    // to pass individual class names to classList.add().
    const classArray = classes.split(' ');
    element.classList.add(...classArray);

    // Make it visible
    element.classList.remove('hidden');

    // Hide after delay
    clearTimeout(element.timer);
    element.timer = setTimeout(() => {
        element.classList.add('hidden');
        // FIX: Remove classes correctly when hiding
        element.classList.remove(...classArray);
    }, delay);
}


// =================================================================
// 2. CORE DISPLAY LOGIC
// =================================================================

/**
 * Renders the album card HTML for a single record.
 * @param {Object} record The record object.
 * @returns {string} The HTML string for the card.
 */
function createCardHtml(record) {
    const valueClass = getValueClass(record);
    const imageUrl = getImageUrl(record);

    return `
        <div class="album-card p-4 transition duration-300 ease-in-out transform hover:scale-[1.03] shadow-lg rounded-xl" 
             style="background-color: var(--color-surface);">
            <!-- Image and Value Indicator -->
            <div class="relative mb-4">
                <img src="${imageUrl}" alt="${record.title} by ${record.artist}" 
                     class="w-full h-auto object-cover rounded-lg shadow-md"
                     onerror="this.onerror=null;this.src='https://placehold.co/150x150/262626/E0E0E0?text=No+Cover';"
                >
                <span class="absolute top-2 right-2 px-3 py-1 text-xs font-bold rounded-full shadow-lg ${valueClass} text-white">
                    $${record.estimated_value_low.toFixed(0)} - $${record.estimated_value_high.toFixed(0)}
                </span>
            </div>

            <!-- Text Content -->
            <h3 class="text-lg font-bold truncate" style="color: var(--color-text-primary);" title="${record.title}">
                ${record.title}
            </h3>
            <p class="text-sm truncate" style="color: var(--color-text-secondary);" title="${record.artist}">
                ${record.artist}
            </p>

            <!-- Details Grid -->
            <div class="mt-3 text-xs grid grid-cols-2 gap-1" style="color: var(--color-text-secondary);">
                <span class="font-semibold">Year:</span>
                <span>${record.original_release_year}</span>
                <span class="font-semibold">Label:</span>
                <span class="truncate" title="${record.label}">${record.label}</span>
                <span class="font-semibold">Format:</span>
                <span>LP</span>
                <span class="font-semibold">Catalog:</span>
                <span class="truncate" title="${record.catalog_no}">${record.catalog_no}</span>
            </div>
        </div>
    `;
}

/**
 * Renders the entire collection to the DOM.
 * @param {Array<Object>} records The array of records to render.
 * @param {HTMLElement} container The DOM element to render into.
 * @param {HTMLElement} messageBox The message box element.
 */
function renderCollection(records, container, messageBox) {
    try {
        if (records.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <p class="text-xl font-semibold text-gray-500">No records found matching your search or filters.</p>
                    <p class="text-md text-gray-400 mt-2">Try adjusting your search terms or filter settings.</p>
                </div>
            `;
            return;
        }

        const html = records.map(createCardHtml).join('');
        container.innerHTML = html;
        showMessage(messageBox, `Displaying ${records.length} record(s).`, 'info');
    } catch (e) {
        showMessage(messageBox, `Error rendering collection: ${e.message}`, 'error');
        console.error("Rendering error:", e);
    }
}

// =================================================================
// 3. USER INTERACTION & FILTERING
// =================================================================

/**
 * Checks if a record matches the current search and filter criteria.
 * @param {Object} record The record object to check.
 * @param {string} searchTerm The search term from the input.
 * @param {Object} filters The current filter state.
 * @returns {boolean} True if the record matches all criteria.
 */
function meetsCriteria(record, searchTerm, filters) {
    const searchLower = searchTerm.toLowerCase();

    // 1. Search Filter (Artist or Title)
    const matchesSearch = record.artist.toLowerCase().includes(searchLower) ||
                          record.title.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // 2. Year Filter
    const recordYear = parseInt(record.original_release_year);
    const yearFrom = filters.yearFrom;
    const yearTo = filters.yearTo;

    if (yearFrom !== null && recordYear < yearFrom) return false;
    if (yearTo !== null && recordYear > yearTo) return false;

    // 3. Format Filter (Currently all are 'LP', but for future expansion)
    // if (filters.format && record.format !== filters.format) return false;

    return true;
}


/**
 * Applies search and filters to the main record list and re-renders the collection.
 * @param {Array<Object>} records The complete list of records.
 * @param {HTMLElement} searchInput The search input element.
 * @param {HTMLElement} container The collection container element.
 * @param {HTMLElement} messageBox The message box element.
 */
function applyFiltersAndSearch(records, searchInput, container, messageBox) {
    const searchTerm = searchInput.value.trim();

    const filteredRecords = records.filter(record => 
        meetsCriteria(record, searchTerm, currentFilters)
    );

    renderCollection(filteredRecords, container, messageBox);
}


/**
 * Handles the click event for the Apply Filter button.
 * Updates the global filter state and re-runs the main filter/search.
 * @param {HTMLElement} yearFromInput The 'Year From' input field.
 * @param {HTMLElement} yearToInput The 'Year To' input field.
 * @param {HTMLElement} searchInput The search input field.
 * @param {HTMLElement} container The collection container.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} filterModal The filter modal element.
 */
function handleApplyFilter(yearFromInput, yearToInput, searchInput, container, messageBox, filterModal) {
    const yearFrom = parseInt(yearFromInput.value.trim());
    const yearTo = parseInt(yearToInput.value.trim());

    // Validation
    if ((yearFrom && isNaN(yearFrom)) || (yearTo && isNaN(yearTo))) {
        showMessage(messageBox, 'Please enter valid years.', 'error');
        return;
    }
    if (yearFrom && yearTo && yearFrom > yearTo) {
        showMessage(messageBox, 'Start Year cannot be after End Year.', 'error');
        return;
    }

    // Update global state
    currentFilters.yearFrom = yearFrom || null;
    currentFilters.yearTo = yearTo || null;
    
    // Apply filters and re-render
    applyFiltersAndSearch(allRecords, searchInput, container, messageBox);

    // Close the modal
    filterModal.classList.add('hidden');
    showMessage(messageBox, 'Filters applied successfully.', 'success');
}

/**
 * Handles the click event for the Reset Filter button.
 * Clears the global filter state and input fields.
 * @param {HTMLElement} yearFromInput The 'Year From' input field.
 * @param {HTMLElement} yearToInput The 'Year To' input field.
 * @param {HTMLElement} searchInput The search input field.
 * @param {HTMLElement} container The collection container.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} filterModal The filter modal element.
 */
function handleResetFilter(yearFromInput, yearToInput, searchInput, container, messageBox, filterModal) {
    // Reset global state
    currentFilters.yearFrom = null;
    currentFilters.yearTo = null;

    // Reset inputs
    yearFromInput.value = '';
    yearToInput.value = '';

    // Apply filters and re-render
    applyFiltersAndSearch(allRecords, searchInput, container, messageBox);

    // Close the modal (optional, but good UX)
    filterModal.classList.add('hidden');
    showMessage(messageBox, 'Filters have been reset.', 'info');
}

/**
 * Binds event listeners to interactive elements.
 * @param {HTMLElement} searchInput
 * @param {HTMLElement} collectionContainer
 * @param {HTMLElement} messageBox
 * @param {HTMLElement} filterModal
 * @param {HTMLElement} filterButton
 * @param {HTMLElement} closeFilterModal
 * @param {HTMLElement} yearFromInput
 * @param {HTMLElement} yearToInput
 * @param {HTMLElement} resetFilterButton
 * @param {HTMLElement} applyFilterButton
 */
function bindEventListeners(
    searchInput, 
    collectionContainer, 
    messageBox, 
    filterModal, 
    filterButton, 
    closeFilterModal, 
    yearFromInput, 
    yearToInput, 
    resetFilterButton, 
    applyFilterButton
) {
    // 1. Search Input Listener (Instant Search)
    searchInput.addEventListener('input', () => 
        applyFiltersAndSearch(allRecords, searchInput, collectionContainer, messageBox)
    );

    // 2. Filter Modal Listeners
    filterButton.addEventListener('click', () => {
        filterModal.classList.remove('hidden');
        // Pre-fill inputs with current state if they exist
        yearFromInput.value = currentFilters.yearFrom || '';
        yearToInput.value = currentFilters.yearTo || '';
    });

    // Close modal via close button
    closeFilterModal.addEventListener('click', () => {
        filterModal.classList.add('hidden');
    });

    // Close modal via clicking outside
    filterModal.addEventListener('click', (event) => {
        if (event.target === filterModal) {
            filterModal.classList.add('hidden');
        }
    });

    // 3. Filter Action Buttons
    // Pass all necessary elements to the handler functions
    applyFilterButton.addEventListener('click', () => 
        handleApplyFilter(yearFromInput, yearToInput, searchInput, collectionContainer, messageBox, filterModal)
    );

    resetFilterButton.addEventListener('click', () => 
        handleResetFilter(yearFromInput, yearToInput, searchInput, collectionContainer, messageBox, filterModal)
    );
}


// =================================================================
// 4. INITIALIZATION
// =================================================================

/**
 * Authenticates the user with Firebase.
 * @param {HTMLElement} messageBox The message box element.
 */
async function authenticateUser(messageBox) {
    try {
        if (initialAuthToken) {
            // Sign in using the custom token provided by the environment
            await signInWithCustomToken(auth, initialAuthToken);
            showMessage(messageBox, 'User authenticated with custom token.', 'info');
        } else {
            // Fallback to anonymous sign-in if no token is available
            await signInAnonymously(auth);
            showMessage(messageBox, 'User signed in anonymously.', 'info');
        }
    } catch (error) {
        showMessage(messageBox, `Authentication Error: ${error.message}`, 'error');
        console.error("Authentication Error:", error);
    }
}

/**
 * Fetches the initial data and sets up the Firestore listener.
 * @param {HTMLElement} collectionContainer The DOM element to render records into.
 * @param {HTMLElement} searchInput The search input element.
 * @param {HTMLElement} messageBox The message box element.
 */
function setupDataListeners(collectionContainer, searchInput, messageBox) {
    // Wait until authentication is complete and userId is available
    if (!isAuthReady || !userId) {
        // This guard is important. Firestore operations must wait for auth state.
        return; 
    }

    try {
        // Path to the user's private collection: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        const q = query(recordsRef);

        // Set up real-time listener
        onSnapshot(q, async (querySnapshot) => {
            const firestoreRecords = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (firestoreRecords.length > 0) {
                // If there is data in Firestore, use it.
                allRecords = firestoreRecords;
                showMessage(messageBox, 'Loaded data from Firestore.', 'success');
            } else {
                // If Firestore is empty, load initial data from JSON (simulating first run)
                const response = await fetch(DATA_PATH);
                const initialData = await response.json();
                
                // For a multi-user app, you would typically write the initial data
                // to Firestore once here if needed, but for simplicity, we just
                // load it into memory for now.
                allRecords = initialData;
                showMessage(messageBox, 'Loaded initial data from JSON.', 'info');
            }

            // Apply current filters/search to the loaded data and render
            applyFiltersAndSearch(allRecords, searchInput, collectionContainer, messageBox);

        }, (error) => {
            showMessage(messageBox, `Firestore Listen Error: ${error.message}`, 'error');
            console.error("Firestore Listen Error:", error);
        });

    } catch (error) {
        showMessage(messageBox, `Error setting up data listeners: ${error.message}`, 'error');
        console.error("Data Listener Setup Error:", error);
    }
}

/**
 * Main application initialization function.
 */
async function initApp() {
    const loadingIndicator = document.getElementById('loading-indicator');
    const messageBox = document.getElementById('message-box');

    try {
        loadingIndicator.style.display = 'block';

        // 1. Initialize Firebase
        if (Object.keys(firebaseConfig).length === 0) {
            showMessage(messageBox, 'Firebase configuration is missing. Cannot persist data.', 'error');
        } else {
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);

            // 2. Set up Auth State Listener
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    userId = user.uid;
                } else {
                    // This block should theoretically not run if sign-in is successful
                    userId = null; 
                }
                isAuthReady = true;
                
                // 3. Find DOM elements
                const searchInput = document.getElementById('search-input');
                const collectionContainer = document.getElementById('collection-container');

                // 4. Once authenticated, set up the data listener
                setupDataListeners(collectionContainer, searchInput, messageBox);
                
                loadingIndicator.style.display = 'none';

                // Display user ID for collaborative context
                const userIdDisplay = document.getElementById('user-id-display');
                if (userIdDisplay) {
                    userIdDisplay.textContent = `User ID: ${userId || 'N/A'}`;
                }
            });

            // 5. Authenticate (triggers onAuthStateChanged)
            await authenticateUser(messageBox);
        }

        // 6. Find DOM elements for event binding
        const searchInput = document.getElementById('search-input');
        const collectionContainer = document.getElementById('collection-container');
        const filterModal = document.getElementById('filter-modal');
        const filterButton = document.getElementById('filter-btn');
        const closeFilterModal = document.getElementById('close-filter-modal');
        const yearFromInput = document.getElementById('filter-year-from');
        const yearToInput = document.getElementById('filter-year-to');
        const resetFilterButton = document.getElementById('reset-filter-button');
        const applyFilterButton = document.getElementById('apply-filter-button');

        // 7. Bind Event Listeners
        bindEventListeners(
            searchInput, 
            collectionContainer, 
            messageBox, 
            filterModal, 
            filterButton, 
            closeFilterModal, 
            yearFromInput, 
            yearToInput, 
            resetFilterButton, 
            applyFilterButton
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
