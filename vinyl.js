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
// Reverted to absolute path for static file fetching consistency
const DATA_PATH = '/assets/json/initialcollection.json'; 

// Firebase Configuration (MUST be provided by the environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// FIX: Robustly parse and check for projectId
let firebaseConfig;
try {
    const rawConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
    firebaseConfig = JSON.parse(rawConfig);
    
    // CRITICAL: Ensure projectId exists to prevent "projectId not provided" error
    if (!firebaseConfig.projectId || firebaseConfig.projectId.length === 0) {
        console.warn("Firebase config missing projectId. Injecting a dummy ID for initialization.");
        // Inject a placeholder ID to satisfy the initializeApp requirement
        firebaseConfig.projectId = 'dummy-project-id'; 
    }
} catch (e) {
    console.error("Error parsing Firebase config from environment. Using minimal dummy config.", e);
    firebaseConfig = { projectId: 'dummy-project-id' }; 
}


// Helper: Custom Message Box (Replaces alert())
/**
 * Shows a custom styled message box on the screen.
 * @param {HTMLElement} boxElement The message box DOM element.
 * @param {string} message The message text.
 * @param {'success'|'error'|'info'} type The type of message.
 */
function showMessage(boxElement, message, type = 'info') {
    // Clear existing classes and set base styles
    boxElement.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl';
    
    // Set type-specific styling
    switch (type) {
        case 'success':
            boxElement.classList.add('bg-green-500', 'text-white');
            break;
        case 'error':
            boxElement.classList.add('bg-red-600', 'text-white');
            break;
        case 'info':
        default:
            boxElement.classList.add('bg-blue-500', 'text-white');
            break;
    }

    boxElement.textContent = message;
    boxElement.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        boxElement.style.display = 'none';
    }, 5000);
}


// Firebase Initialization and Authentication
/**
 * Initializes Firebase, authenticates the user, and sets up the Firestore listener.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} loadingIndicator The loading indicator element.
 */
async function setupFirebase(messageBox, loadingIndicator) {
    try {
        setLogLevel('debug'); // Enable Firestore logging for debugging
        
        // FIX: initializeApp should now succeed due to the config check above
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Authenticate the user
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            // Sign in anonymously if no custom token is available (e.g., local testing)
            await signInAnonymously(auth);
        }

        // Set up Auth State Listener
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                showMessage(messageBox, `Welcome back! User ID: ${userId}`, 'success');
            } else {
                // If sign-in fails, userId remains null
                userId = null;
                showMessage(messageBox, 'Signed out or failed to sign in.', 'error');
            }
            isAuthReady = true;
            // Once auth is ready, fetch and listen to data
            setupDataListener(messageBox, loadingIndicator);
        });

    } catch (error) {
        // If initializeApp still fails for another reason, catch it here
        showMessage(messageBox, `Firebase setup failed: ${error.message}`, 'error');
        console.error("Firebase setup error:", error);
        loadingIndicator.style.display = 'none';
        
        // As a last resort, just load static data if setup fails completely
        const staticRecords = await fetchInitialData();
        allRecords = staticRecords;
        renderRecords(allRecords); 
    }
}


// =================================================================
// 2. CORE DISPLAY LOGIC
// =================================================================

/**
 * Fetches the initial static data from the JSON file.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of record objects.
 */
async function fetchInitialData() {
    try {
        const response = await fetch(DATA_PATH);
        if (!response.ok) {
            // Log a warning if static data is missing but don't stop the app
            console.warn(`Could not load static data from ${DATA_PATH}. Status: ${response.status}`);
            return [];
        }
        return response.json();
    } catch (e) {
        console.error("Error loading initial data. If this happens, only Firestore data will be shown.", e);
        // Return an empty array to allow the app to continue running
        return []; 
    }
}

/**
 * Sets up the real-time listener for the user's private collection in Firestore.
 * @param {HTMLElement} messageBox The message box element.
 * @param {HTMLElement} loadingIndicator The loading indicator element.
 */
async function setupDataListener(messageBox, loadingIndicator) {
    // Ensure we only proceed if Firebase has been initialized and auth state is determined
    if (!db || !isAuthReady) {
        // Fallback: If auth failed, we still need to load the static data.
        const staticRecords = await fetchInitialData();
        allRecords = staticRecords;
        renderRecords(allRecords);
        loadingIndicator.style.display = 'none';
        return;
    }
    
    // If the userId is null (i.e., sign-in failed), we only load static data
    if (!userId) {
        showMessage(messageBox, "Authentication failed. Loading static data only.", 'info');
        const staticRecords = await fetchInitialData();
        allRecords = staticRecords;
        renderRecords(allRecords);
        loadingIndicator.style.display = 'none';
        return;
    }

    try {
        // Initial fetch of static data, before the Firestore listener starts
        const staticRecords = await fetchInitialData();

        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        const q = query(recordsRef);

        // Listen for real-time updates from Firestore
        onSnapshot(q, (snapshot) => {
            const firestoreRecords = [];
            snapshot.forEach((doc) => {
                // Add the Firestore document ID to the record data
                firestoreRecords.push({ id: doc.id, firestoreDocId: doc.id, ...doc.data() });
            });

            // The final collection combines static and user-added records
            // Static data acts as a starting point, Firestore data is the user's contribution
            const finalRecords = [...staticRecords, ...firestoreRecords];

            allRecords = finalRecords;
            console.log(`Total records loaded (Static + Firestore): ${allRecords.length}`);
            
            // Immediately render the full, unfiltered collection
            applySearchAndFilter(); // Use the existing filter function to handle the initial render
            loadingIndicator.style.display = 'none';
        }, (error) => {
            showMessage(messageBox, `Error loading collection data: ${error.message}. Displaying static collection.`, 'error');
            console.error("Firestore listen error:", error);
            
            // If Firestore fails, ensure we still render the static data
            allRecords = staticRecords;
            renderRecords(allRecords); 
            loadingIndicator.style.display = 'none';
        });

    } catch (e) {
        // Catches errors with collection() or query() setup
        showMessage(messageBox, `Error setting up collection listener: ${e.message}`, 'error');
        console.error("Listener setup error:", e);
        loadingIndicator.style.display = 'none';
    }
}


/**
 * Creates the HTML string for a single album card.
 * @param {Object} record The record object.
 * @returns {string} The HTML string for the card.
 */
function createAlbumCard(record) {
    const defaultCover = `https://placehold.co/300x300/1A1A1A/E0E0E0?text=${record.artist}+${record.title.split(' ')[0]}`;

    // Calculate average value for visual indicator
    // NOTE: This feature remains, as per the current user request (only the on-screen report was to be stopped).
    const avgValue = (record.estimated_value_low + record.estimated_value_high) / 2;
    let valueColorClass = 'bg-gray-700'; // Default dark color
    if (avgValue > 40) {
        valueColorClass = 'bg-red-600'; // High value
    } else if (avgValue > 20) {
        valueColorClass = 'bg-yellow-600'; // Mid value
    } else if (avgValue > 0) {
        valueColorClass = 'bg-green-600'; // Low value
    }

    const valueRange = `$${record.estimated_value_low.toFixed(2)} - $${record.estimated_value_high.toFixed(2)}`;

    return `
        <div class="album-card group" data-id="${record.id}">
            <div class="h-48 sm:h-64 md:h-56 overflow-hidden relative">
                <!-- Placeholder Image -->
                <img src="${defaultCover}" 
                     alt="Cover art for ${record.title}" 
                     class="w-full h-full object-cover transition duration-300 group-hover:opacity-80">
                
                <!-- Value Indicator Badge -->
                <div class="absolute top-2 right-2 ${valueColorClass} text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                    ${valueRange}
                </div>
            </div>
            <div class="p-4">
                <h3 class="text-lg font-heading font-semibold text-color-text-primary truncate" title="${record.title}">
                    ${record.title}
                </h3>
                <p class="text-sm text-color-text-secondary truncate mt-1">
                    ${record.artist}
                </p>
                <div class="text-xs text-color-text-secondary mt-2 flex justify-between">
                    <span>${record.original_release_year}</span>
                    <span class="font-mono text-color-accent-teal">${record.catalog_no || 'N/A'}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the array of records to the DOM.
 * @param {Array<Object>} records The array of record objects to render.
 */
function renderRecords(records) {
    const grid = document.getElementById('collection-grid');
    const emptyState = document.getElementById('empty-state');
    
    // Check if there are records to display
    if (records.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';

    // Generate all card HTML strings and join them
    const cardsHtml = records.map(createAlbumCard).join('');
    grid.innerHTML = cardsHtml;
}


// =================================================================
// 3. USER INTERACTION (Search & Filter)
// =================================================================

/**
 * Applies the current search and filter criteria to the global list of records.
 */
function applySearchAndFilter() {
    const searchInput = document.getElementById('search-input');
    const query = searchInput.value.toLowerCase();

    // 1. Filter based on current filters (Year/Format)
    let filteredRecords = allRecords.filter(record => {
        const year = parseInt(record.original_release_year);
        
        // Year filtering
        const yearMatch = (!currentFilters.yearFrom || year >= currentFilters.yearFrom) &&
                          (!currentFilters.yearTo || year <= currentFilters.yearTo);

        // Format filtering (currently a placeholder for this example)
        const formatMatch = !currentFilters.format || record.format === currentFilters.format; 

        return yearMatch && formatMatch;
    });

    // 2. Filter based on search query (Artist/Title)
    const finalRecords = filteredRecords.filter(record => {
        return record.artist.toLowerCase().includes(query) || 
               record.title.toLowerCase().includes(query);
    });

    // 3. Render the results
    renderRecords(finalRecords);
}


/**
 * Handles the logic for the Filter Modal and its buttons.
 * @param {HTMLElement} filterModal The filter modal DOM element.
 * @param {HTMLElement} filterBtn The button that opens the modal.
 * @param {HTMLElement} closeModalButton The button that closes the modal.
 * @param {HTMLElement} resetFilterButton The button that resets the form.
 * @param {HTMLElement} applyFilterButton The button that applies the filters.
 */
function setupFilterModal(filterModal, filterBtn, closeModalButton, resetFilterButton, applyFilterButton) {
    const yearFromInput = document.getElementById('filter-year-from');
    const yearToInput = document.getElementById('filter-year-to');
    const formatSelect = document.getElementById('filter-format');

    // Open the modal
    filterBtn.addEventListener('click', () => {
        filterModal.classList.remove('hidden');
        // Ensure form reflects current state when opening
        yearFromInput.value = currentFilters.yearFrom || '';
        yearToInput.value = currentFilters.yearTo || '';
        formatSelect.value = currentFilters.format || '';
    });

    // Close the modal
    closeModalButton.addEventListener('click', () => {
        filterModal.classList.add('hidden');
    });

    // Reset filters
    resetFilterButton.addEventListener('click', () => {
        yearFromInput.value = '';
        yearToInput.value = '';
        formatSelect.value = '';
        currentFilters = { format: '', yearFrom: null, yearTo: null };
        filterModal.classList.add('hidden');
        applySearchAndFilter(); // Apply reset immediately
    });

    // Apply filters
    applyFilterButton.addEventListener('click', () => {
        const from = parseInt(yearFromInput.value);
        const to = parseInt(yearToInput.value);
        
        currentFilters.yearFrom = (isNaN(from) || from < 0) ? null : from;
        currentFilters.yearTo = (isNaN(to) || to < 0) ? null : to;
        currentFilters.format = formatSelect.value;
        
        filterModal.classList.add('hidden');
        applySearchAndFilter();
    });
}


// =================================================================
// 4. INITIALIZATION
// =================================================================

/**
 * Main application initializer.
 */
async function initApp() {
    const messageBox = document.getElementById('message-box');
    const loadingIndicator = document.getElementById('loading-indicator');
    const searchInput = document.getElementById('search-input');
    const filterModal = document.getElementById('filter-modal');
    const filterBtn = document.getElementById('filter-btn');
    const closeModalButton = document.getElementById('close-modal-button');
    const resetFilterButton = document.getElementById('reset-filter-button');
    const applyFilterButton = document.getElementById('apply-filter-button');

    // Show loading indicator before fetching data
    loadingIndicator.style.display = 'block';

    try {
        // 1. Setup Firebase and Authentication, which then triggers the Firestore listener
        await setupFirebase(messageBox, loadingIndicator);

        // 2. Setup event listeners
        
        // Search listener (debounce for performance)
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applySearchAndFilter, 300);
        });

        // Filter modal setup
        setupFilterModal(
            filterModal, 
            filterBtn, 
            closeModalButton, 
            resetFilterButton, 
            applyFilterButton
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
// This function demonstrates how data would be saved to Firestore.
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
