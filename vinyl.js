// VETERAN CLASS NOTE: This script has been updated to include Firebase Social Sign-On (SSO) 
// for Google, Apple, Microsoft, and Facebook, enhancing security and user experience. 
// The core logic for data fetching now runs only after a user (anonymous or authenticated) is signed in.

// =================================================================
// 1. SETUP & UTILITIES
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged,
    // SSO Providers and functions
    GoogleAuthProvider,
    FacebookAuthProvider,
    OAuthProvider, // Used for Apple and Microsoft
    signInWithPopup,
    signOut
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
let isAuthReady = false; // Flag to indicate when Firebase Auth state is settled
let unsubscribeSnapshot = null; // To hold the Firestore snapshot listener

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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// SSO Provider IDs for Apple and Microsoft (Must be configured in Firebase Console)
// These IDs are standard Firebase Auth identifiers
const MICROSOFT_PROVIDER_ID = 'microsoft.com';
const APPLE_PROVIDER_ID = 'apple.com';

// =================================================================
// 2. HELPER FUNCTIONS
// =================================================================

/**
 * Shows a temporary message notification in the message box.
 * @param {HTMLElement} messageBox The message box element.
 * @param {string} message The message text.
 * @param {('success'|'error'|'info')} type The type of message.
 */
function showMessage(messageBox, message, type) {
    if (!messageBox) return;
    
    // Clear previous classes
    messageBox.className = 'message-box fixed top-4 right-4 z-50 p-3 rounded-lg shadow-xl';
    messageBox.style.display = 'block';

    if (type === 'success') {
        messageBox.classList.add('bg-green-500', 'text-white');
    } else if (type === 'error') {
        messageBox.classList.add('bg-red-600', 'text-white');
    } else { // info
        messageBox.classList.add('bg-blue-500', 'text-white');
    }

    messageBox.textContent = message;

    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
}

// =================================================================
// 3. FIREBASE INITIALIZATION AND AUTHENTICATION
// =================================================================

/**
 * Handles the state change for authentication and updates the UI.
 * @param {Object} user The authenticated user object or null.
 */
function handleAuthStateChange(user) {
    const messageBox = document.getElementById('message-box');
    const authUserInfo = document.getElementById('auth-user-info');
    const ssoButtons = document.getElementById('sso-buttons');
    const authUserIdSpan = document.getElementById('auth-user-id');
    const signOutButton = document.getElementById('sign-out-button');
    
    // Clear any previous listener
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
    }

    if (user) {
        userId = user.uid;
        isAuthReady = true;

        // Update UI for signed-in user
        authUserIdSpan.textContent = userId;
        authUserInfo.classList.remove('hidden');
        ssoButtons.classList.add('hidden');
        
        // Show the Sign Out button
        signOutButton.classList.remove('hidden');
        
        // Start Firestore listener for user-specific data
        setupFirestoreListener(messageBox);

        // If it's a social sign-in, show success message
        if (user.isAnonymous === false && user.providerData.length > 0) {
             const providerName = user.providerData[0].providerId.split('.')[0].replace(/^(\w)/, c => c.toUpperCase());
             showMessage(messageBox, `Welcome back! Signed in with ${providerName}.`, 'success');
        }

    } else {
        // User is signed out (or initially anonymous)
        userId = null;
        isAuthReady = true; // Still ready, just anonymous/signed out

        // Update UI for anonymous/signed-out state
        authUserInfo.classList.add('hidden');
        ssoButtons.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        
        // When signed out, we still proceed to load the initial dataset
        setupFirestoreListener(messageBox, true);
    }
}

/**
 * Initializes Firebase, authenticates the user, and sets up auth state listener.
 * @param {HTMLElement} messageBox The message box element.
 */
async function initializeFirebase(messageBox) {
    try {
        const token = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        // Set log level for debugging
        setLogLevel('debug'); 

        // 1. Set up the Auth State Listener FIRST
        onAuthStateChanged(auth, (user) => {
            handleAuthStateChange(user);
        });

        // 2. Perform initial sign-in (Custom Token or Anonymous)
        if (token) {
            // Attempt to sign in with custom token
            await signInWithCustomToken(auth, token);
            showMessage(messageBox, 'Signed in with custom token.', 'info');
        } else {
            // If no custom token, sign in anonymously
            await signInAnonymously(auth);
            // The handleAuthStateChange listener will fire after this
            showMessage(messageBox, 'Signed in anonymously. Sign in with a social option to permanently save your collection.', 'info');
        }
        
    } catch (error) {
        showMessage(messageBox, `Firebase Init Error: ${error.message}`, 'error');
        console.error("Firebase initialization failed:", error);
    }
}

// =================================================================
// 4. SSO AND SIGN OUT LOGIC
// =================================================================

/**
 * Handles signing in using a social provider via popup.
 * @param {Object} provider The Firebase Auth Provider instance.
 * @param {string} providerName A user-friendly name for the provider.
 * @param {HTMLElement} messageBox The message box element.
 */
async function handleSSOSignIn(provider, providerName, messageBox) {
    if (!auth) {
        showMessage(messageBox, 'Authentication service not ready.', 'error');
        return;
    }
    
    try {
        const result = await signInWithPopup(auth, provider);
        // The onAuthStateChanged listener will handle the UI update
        console.log(`Successfully signed in with ${providerName}`, result.user);

    } catch (error) {
        let errorMessage = `Sign-in with ${providerName} failed: ${error.message}`;
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = `Sign-in with ${providerName} cancelled.`;
        } else if (error.code === 'auth/unauthorized-domain' || error.code === 'auth/operation-not-allowed') {
            errorMessage = `Sign-in with ${providerName} failed. Please ensure the provider is enabled and configured in Firebase Auth Console.`;
        }
        showMessage(messageBox, errorMessage, 'error');
        console.error(`SSO Error (${providerName}):`, error);
    }
}

/**
 * Sets up click listeners for all SSO buttons and the Sign Out button.
 * @param {HTMLElement} messageBox The message box element.
 */
function setupSSOListeners(messageBox) {
    const googleBtn = document.getElementById('google-sso-button');
    const facebookBtn = document.getElementById('facebook-sso-button');
    const appleBtn = document.getElementById('apple-sso-button');
    const microsoftBtn = document.getElementById('microsoft-sso-button');
    const signOutBtn = document.getElementById('sign-out-button');

    if (googleBtn) {
        googleBtn.onclick = () => handleSSOSignIn(new GoogleAuthProvider(), 'Google', messageBox);
    }
    if (facebookBtn) {
        facebookBtn.onclick = () => handleSSOSignIn(new FacebookAuthProvider(), 'Facebook', messageBox);
    }
    if (appleBtn) {
        // OAuthProvider is used for non-standard providers like Apple and Microsoft
        const appleProvider = new OAuthProvider(APPLE_PROVIDER_ID);
        appleBtn.onclick = () => handleSSOSignIn(appleProvider, 'Apple', messageBox);
    }
    if (microsoftBtn) {
        const microsoftProvider = new OAuthProvider(MICROSOFT_PROVIDER_ID);
        microsoftBtn.onclick = () => handleSSOSignIn(microsoftProvider, 'Microsoft', messageBox);
    }
    
    if (signOutBtn) {
        signOutBtn.onclick = async () => {
            if (auth) {
                try {
                    await signOut(auth);
                    showMessage(messageBox, 'Successfully signed out.', 'info');
                    // Re-authenticate anonymously after sign out, allowing data load
                    await signInAnonymously(auth); 
                } catch (error) {
                    showMessage(messageBox, `Sign out failed: ${error.message}`, 'error');
                }
            }
        };
    }
}

// =================================================================
// 5. DATA FETCHING AND RENDERING LOGIC (Updated to use onAuthStateChanged)
// =================================================================

/**
 * Fetches the initial JSON data.
 * @returns {Promise<Array<Object>>} The array of records.
 */
async function fetchInitialData() {
    try {
        const response = await fetch(DATA_PATH);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    } catch (e) {
        console.error("Error fetching initial data:", e);
        return [];
    }
}

/**
 * Sets up a Firestore real-time listener for the user's data.
 * If user is anonymous or signed out, it fetches the initial static data.
 * @param {HTMLElement} messageBox The message box element.
 * @param {boolean} loadStaticDataFallback If true, loads static JSON data.
 */
async function setupFirestoreListener(messageBox, loadStaticDataFallback = false) {
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';

    if (loadStaticDataFallback || !userId || !db) {
        // Fallback: Load static JSON data for anonymous/signed-out users
        const staticRecords = await fetchInitialData();
        allRecords = staticRecords.map(record => ({
            ...record,
            // Assign a unique fake ID for display purposes
            id: record.id || crypto.randomUUID(), 
            // Mark as static data
            isStatic: true 
        }));
        // Since static data loaded, now render it
        renderCollection(allRecords);
        loadingIndicator.style.display = 'none';
        return;
    }
    
    // Clear the previous listener before setting a new one
    if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
    }

    try {
        // Path: /artifacts/{appId}/users/{userId}/records
        const recordsRef = collection(db, 'artifacts', appId, 'users', userId, COLLECTION_PATH);
        const q = query(recordsRef);

        // Set up the real-time listener
        unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
            const records = [];
            snapshot.forEach((doc) => {
                records.push({ id: doc.id, ...doc.data() });
            });
            allRecords = records;
            renderCollection(allRecords);
            loadingIndicator.style.display = 'none';

            // Show a success message if records were fetched from Firestore
            if (!snapshot.metadata.hasPendingWrites) {
                // Only show this once, on the initial load from the server
                if (snapshot.size > 0 && snapshot.metadata.fromCache === false) {
                    showMessage(messageBox, `Loaded ${snapshot.size} records from your personal collection!`, 'success');
                }
            }
        }, (error) => {
            showMessage(messageBox, `Firestore Listen Error: ${error.message}`, 'error');
            console.error("Firestore Listen Error:", error);
            loadingIndicator.style.display = 'none';
        });

    } catch (error) {
        showMessage(messageBox, `Failed to setup Firestore listener: ${error.message}`, 'error');
        console.error("Setup Firestore Listener Error:", error);
        loadingIndicator.style.display = 'none';
    }
}


/**
 * Renders the collection cards to the DOM.
 * @param {Array<Object>} records The array of record objects to display.
 */
function renderCollection(records) {
    const grid = document.getElementById('collection-grid');
    const noResults = document.getElementById('no-results');
    grid.innerHTML = ''; 

    // 1. Apply Filtering
    const filteredRecords = filterRecords(records);
    
    if (filteredRecords.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');

    // 2. Generate HTML for each record
    const html = filteredRecords.map(record => {
        const estimatedValue = (record.estimated_value_low + record.estimated_value_high) / 2;
        let valueClass = 'bg-gray-500'; // Default
        
        // Simple value tiering for visual feedback
        if (estimatedValue > 40) {
            valueClass = 'bg-red-600'; // High
        } else if (estimatedValue > 20) {
            valueClass = 'bg-yellow-500'; // Mid
        } else {
            valueClass = 'bg-green-600'; // Low
        }

        const imageUrl = `https://placehold.co/300x300/1A1A1A/E0E0E0?text=${record.artist}+%26+${record.title.split(' ')[0]}`;

        return `
            <div class="album-card group">
                <div class="relative overflow-hidden w-full h-auto aspect-square">
                    <img src="${imageUrl}" alt="${record.title} by ${record.artist}" 
                         class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                         onerror="this.onerror=null; this.src='https://placehold.co/300x300/1A1A1A/E0E0E0?text=NO+IMAGE';">
                    <div class="absolute top-2 left-2 p-1 text-xs font-bold text-white rounded-full ${valueClass} shadow-lg">
                        $${estimatedValue.toFixed(2)}
                    </div>
                </div>
                <div class="p-4">
                    <p class="text-sm text-gray-400 mb-1 truncate">${record.artist}</p>
                    <h3 class="text-lg font-bold text-white leading-tight truncate" title="${record.title}">${record.title}</h3>
                    <div class="mt-2 text-xs text-gray-500 flex justify-between">
                        <span>${record.original_release_year}</span>
                        <span>${record.label}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = html;
}

/**
 * Applies current search and filter criteria to the records array.
 * @param {Array<Object>} records The full array of records.
 * @returns {Array<Object>} The filtered array.
 */
function filterRecords(records) {
    const searchInput = document.getElementById('search-input').value.toLowerCase();
    
    return records.filter(record => {
        // 1. Search Filter
        const matchesSearch = !searchInput || 
                              record.artist.toLowerCase().includes(searchInput) || 
                              record.title.toLowerCase().includes(searchInput);

        if (!matchesSearch) return false;

        // 2. Format Filter
        if (currentFilters.format && currentFilters.format !== '') {
            // Note: Our initial data doesn't have a 'format' field, 
            // but we'll simulate by checking a placeholder or a new field if one exists later.
            // For now, if the filter is set, we'll treat it as a placeholder for future use.
            // A realistic check would be: record.format === currentFilters.format
        }

        // 3. Year Range Filter
        const recordYear = parseInt(record.original_release_year, 10);
        const yearFrom = currentFilters.yearFrom;
        const yearTo = currentFilters.yearTo;

        const matchesYearFrom = !yearFrom || recordYear >= yearFrom;
        const matchesYearTo = !yearTo || recordYear <= yearTo;

        return matchesYearFrom && matchesYearTo;
    });
}

// =================================================================
// 6. USER INTERACTION (Search and Filter)
// =================================================================

/**
 * Sets up listeners for search input and filter buttons.
 */
function setupInteractionListeners(filterButton, closeModalButton, resetFilterButton, applyFilterButton) {
    const searchInput = document.getElementById('search-input');
    const filterModal = document.getElementById('filter-modal');

    // Search input listener
    if (searchInput) {
        searchInput.addEventListener('input', () => renderCollection(allRecords));
    }

    // Filter button - Open modal
    if (filterButton) {
        filterButton.addEventListener('click', () => {
            filterModal.classList.remove('hidden');
        });
    }

    // Close modal button
    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            filterModal.classList.add('hidden');
        });
    }
    
    // Apply Filter button
    if (applyFilterButton) {
        applyFilterButton.addEventListener('click', () => {
            const formatInput = document.getElementById('filter-format').value;
            const yearFromInput = parseInt(document.getElementById('filter-year-from').value, 10);
            const yearToInput = parseInt(document.getElementById('filter-year-to').value, 10);

            currentFilters = {
                format: formatInput,
                yearFrom: isNaN(yearFromInput) ? null : yearFromInput,
                yearTo: isNaN(yearToInput) ? null : yearToInput,
            };

            filterModal.classList.add('hidden');
            renderCollection(allRecords); // Re-render with new filters
        });
    }

    // Reset Filter button
    if (resetFilterButton) {
        resetFilterButton.addEventListener('click', () => {
            document.getElementById('filter-format').value = '';
            document.getElementById('filter-year-from').value = '';
            document.getElementById('filter-year-to').value = '';

            currentFilters = { format: '', yearFrom: null, yearTo: null };

            renderCollection(allRecords); // Re-render with cleared filters
            filterModal.classList.add('hidden');
        });
    }
}

// =================================================================
// 7. APPLICATION INITIALIZATION
// =================================================================

/**
 * Initializes the entire application.
 */
async function initApp() {
    const messageBox = document.getElementById('message-box');
    const loadingIndicator = document.getElementById('loading-indicator');
    loadingIndicator.style.display = 'block';

    try {
        await initializeFirebase(messageBox);
        
        // Setup Interaction Listeners (Search and Filter)
        const filterButton = document.getElementById('filter-btn');
        const closeModalButton = document.getElementById('close-filter-button');
        const resetFilterButton = document.getElementById('reset-filter-button');
        const applyFilterButton = document.getElementById('apply-filter-button');

        setupInteractionListeners(
            filterButton,
            closeModalButton,
            resetFilterButton,
            applyFilterButton
        );

        // Setup SSO/Sign Out listeners
        setupSSOListeners(messageBox);


    } catch (error) {
        showMessage(messageBox, `Failed to initialize application: ${error.message}`, 'error');
        loadingIndicator.style.display = 'none';
    }
}

// Start the application when the window loads
window.onload = initApp;


// =================================================================
// 8. SAMPLE FUNCTION TO SAVE DATA (For Future Upload Feature)
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
