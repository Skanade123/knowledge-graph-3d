// ar-graph.js - Mobile-Optimized AR Knowledge Graph for Pixel 7
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';

let scene, camera, renderer, raycaster, mouse;
let nodes = [];
let edges = [];
let graphGroup;
let graphData = null;
let selectedNode = null;
let currentMode = null;
let reticle;
let hitTestSource = null;
let hitTestSourceRequested = false;

// Mobile-specific variables
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let touchStartPos = null;
let longPressTimer = null;
let rotationEnabled = false;

const nodeColors = {
    'Document': 0xff6b6b,
    'Chunk': 0x4ecdc4,
    'default': 0x45b7d1
};

// Initialize on page load
window.addEventListener('load', () => {
    checkARSupport();
    loadGraphData();
    
    // Add mobile helper text
    if (isMobile) {
        console.log('Mobile device detected - optimizing touch controls');
    }
});

async function checkARSupport() {
    if ('xr' in navigator) {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        const msg = document.getElementById('ar-support-msg');
        if (supported) {
            msg.innerHTML = '✅ AR is supported on this device';
            msg.style.color = '#4ecdc4';
        } else {
            msg.innerHTML = '⚠️ AR not supported. Use 3D Mode instead.';
            msg.style.color = '#ff6b6b';
        }
    } else {
        document.getElementById('ar-support-msg').innerHTML = '⚠️ WebXR not available. Use 3D Mode.';
    }
}

async function loadGraphData() {
    try {
        const response = await fetch('./Data/knowledge-graph.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        graphData = await response.json();
        document.getElementById('loading-screen').style.display = 'none';
    } catch (error) {
        console.error('Error loading graph data:', error);
        document.getElementById('loading-screen').innerHTML = `
            <div style="color: white; text-align: center; padding: 20px;">
                <h2>❌ Error Loading Data</h2>
                <p>${error.message}</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Make sure knowledge-graph.json is in the Data folder</p>
                <button onclick="location.reload()" style="
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 1em;
                ">Retry</button>
            </div>
        `;
    }
}

window.startARMode = async function() {
    if (!graphData) {
        alert('Data not loaded yet. Please wait...');
        return;
    }
    
    currentMode = 'ar';
    document.getElementById('mode-selector').style.display = 'none';
    document.getElementById('ar-instructions').style.display = 'block';
    
    initARScene();
    showUI();
};

window.start3DMode = function() {
    if (!graphData) {
        alert('Data not loaded yet. Please wait...');
        return;
    }
    
    currentMode = '3d';
    document.getElementById('mode-selector').style.display = 'none';
    
    init3DScene();
    showUI();
    
    // Show mobile instructions
    if (isMobile) {
        showMobileInstructions();
    }
};

function showMobileInstructions() {
    const instructions = document.createElement('div');
    instructions.id = 'mobile-instructions';
    instructions.innerHTML = `
        <div style="
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 30, 0.98);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            z-index: 999;
            text-align: center;
            max-width: 90%;
        ">
            <h3 style="color: #fff; margin-bottom: 15px; font-size: 1.2em;">📱 Touch Controls</h3>
            <div style="color: #ccc; line-height: 1.8; font-size: 0.95em; text-align: left;">
                <p>👆 <strong>Tap node:</strong> View details</p>
                <p>🔄 <strong>Hold & drag:</strong> Rotate graph</p>
                <p>🤏 <strong>Pinch:</strong> Zoom in/out</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                margin-top: 20px;
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1em;
            ">Got it!</button>
        </div>
    `;
    document.body.appendChild(instructions);
    
    setTimeout(() => {
        if (document.getElementById('mobile-instructions')) {
            instructions.remove();
        }
    }, 5000);
}

function initARScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: true 
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.getElementById('container').appendChild(renderer.domElement);

    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    document.body.appendChild(arButton);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x667eea });
    reticle = new THREE.Mesh(geometry, material);
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    graphGroup = new THREE.Group();
    graphGroup.visible = false;
    scene.add(graphGroup);

    createGraph();
    setupARControls();
    renderer.setAnimationLoop(renderAR);

    document.getElementById('mode-indicator').textContent = '📱 AR Mode';
}

function init3DScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = isMobile ? 40 : 30;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Optimize for mobile
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 0.8);
    pointLight.position.set(20, 20, 20);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0xffffff, 0.4);
    pointLight2.position.set(-20, -20, -20);
    scene.add(pointLight2);

    graphGroup = new THREE.Group();
    scene.add(graphGroup);

    createGraph();

    raycaster = new THREE.Raycaster();
    // Increase raycaster threshold for easier mobile tapping
    raycaster.params.Points.threshold = isMobile ? 1 : 0.5;
    mouse = new THREE.Vector2();
    
    setupMobileControls();
    animate3D();

    document.getElementById('mode-indicator').textContent = '🖥️ 3D Mode';
}

function createGraph() {
    const entities = graphData.entities || [];
    const relationships = graphData.relationships || [];

    nodes = [];
    edges = [];
    while (graphGroup.children.length > 0) {
        graphGroup.remove(graphGroup.children[0]);
    }

    const nodeMap = new Map();
    const radius = currentMode === 'ar' ? 0.15 : 15;

    // Create larger nodes for mobile
    const mobileScale = isMobile ? 1.3 : 1;

    entities.forEach((entity, index) => {
        const angle = (index / entities.length) * Math.PI * 2;
        const tier = Math.floor(index / 6);
        const r = radius * (1 + tier * 0.3);
        
        const x = Math.cos(angle) * r;
        const y = (Math.random() - 0.5) * radius * 0.5;
        const z = Math.sin(angle) * r;

        const color = nodeColors[entity.type] || nodeColors.default;
        const baseSize = entity.type === 'Document' ? 
            (currentMode === 'ar' ? 0.03 : 1.5) : 
            (currentMode === 'ar' ? 0.015 : 0.8);
        
        const size = baseSize * mobileScale;
        
        const geometry = new THREE.SphereGeometry(size, isMobile ? 12 : 16, isMobile ? 12 : 16);
        const material = new THREE.MeshPhongMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const sphere = new THREE.Mesh(geometry, material);
        
        sphere.position.set(x, y, z);
        sphere.userData = entity;
        sphere.userData.originalColor = color;
        sphere.userData.originalScale = 1;
        graphGroup.add(sphere);
        nodes.push(sphere);
        nodeMap.set(entity.id, sphere);
    });

    // Create links
    let links = [];
    if (relationships && relationships.length > 0) {
        links = relationships;
    } else {
        entities.forEach(entity => {
            if (entity.properties && entity.properties.document_id) {
                links.push({
                    source: entity.properties.document_id,
                    target: entity.id
                });
            }
        });
    }

    links.forEach(rel => {
        const sourceNode = nodeMap.get(rel.source);
        const targetNode = nodeMap.get(rel.target);
        
        if (sourceNode && targetNode) {
            const points = [sourceNode.position, targetNode.position];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: 0x888888,
                transparent: true,
                opacity: 0.3
            });
            const line = new THREE.Line(geometry, material);
            graphGroup.add(line);
            edges.push(line);
        }
    });

    document.getElementById('node-count').textContent = entities.length;
    document.getElementById('link-count').textContent = links.length;

    if (currentMode === 'ar') {
        graphGroup.scale.set(1, 1, 1);
    }
}

function setupARControls() {
    const controller = renderer.xr.getController(0);
    controller.addEventListener('select', onARSelect);
    scene.add(controller);
}

function onARSelect() {
    if (reticle.visible && !graphGroup.visible) {
        graphGroup.position.setFromMatrixPosition(reticle.matrix);
        graphGroup.visible = true;
        document.getElementById('ar-instructions').style.display = 'none';
    }
}

function setupMobileControls() {
    let touchStartDistance = 0;
    let lastTouchPos = { x: 0, y: 0 };
    let touchMoveDistance = 0;
    let isTwoFingerGesture = false;
    
    // Prevent default behaviors
    renderer.domElement.addEventListener('touchstart', (e) => {
        touchMoveDistance = 0;
        isTwoFingerGesture = e.touches.length === 2;
        
        if (e.touches.length === 1) {
            touchStartPos = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
            lastTouchPos = { ...touchStartPos };
            
            // Start long press detection for rotation
            longPressTimer = setTimeout(() => {
                rotationEnabled = true;
                // Haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
            }, 200); // 200ms to activate rotation
            
        } else if (e.touches.length === 2) {
            // Two finger pinch
            clearTimeout(longPressTimer);
            rotationEnabled = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchStartDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && touchStartPos) {
            const dx = e.touches[0].clientX - touchStartPos.x;
            const dy = e.touches[0].clientY - touchStartPos.y;
            touchMoveDistance += Math.abs(dx) + Math.abs(dy);
            
            if (rotationEnabled) {
                e.preventDefault();
                const deltaX = e.touches[0].clientX - lastTouchPos.x;
                const deltaY = e.touches[0].clientY - lastTouchPos.y;
                
                graphGroup.rotation.y += deltaX * 0.008;
                graphGroup.rotation.x += deltaY * 0.008;
                
                lastTouchPos = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY
                };
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (touchStartDistance > 0) {
                const delta = (distance - touchStartDistance) * 0.05;
                camera.position.z -= delta;
                camera.position.z = Math.max(10, Math.min(100, camera.position.z));
                touchStartDistance = distance;
            }
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', (e) => {
        clearTimeout(longPressTimer);
        
        // Single tap detection - only if minimal movement
        if (e.changedTouches.length === 1 && !rotationEnabled && touchMoveDistance < 15 && !isTwoFingerGesture) {
            const touch = e.changedTouches[0];
            handleNodeSelection(touch.clientX, touch.clientY);
        }
        
        rotationEnabled = false;
        touchStartDistance = 0;
        touchStartPos = null;
        touchMoveDistance = 0;
        isTwoFingerGesture = false;
    }, { passive: true });

    // Mouse controls for desktop
    if (!isMobile) {
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };

        renderer.domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        renderer.domElement.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - previousMousePosition.x;
                const deltaY = e.clientY - previousMousePosition.y;

                graphGroup.rotation.y += deltaX * 0.01;
                graphGroup.rotation.x += deltaY * 0.01;

                previousMousePosition = { x: e.clientX, y: e.clientY };
            }
        });

        renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
        });

        renderer.domElement.addEventListener('click', (e) => {
            if (!isDragging) {
                handleNodeSelection(e.clientX, e.clientY);
            }
        });

        renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            camera.position.z += e.deltaY * 0.02;
            camera.position.z = Math.max(10, Math.min(100, camera.position.z));
        }, { passive: false });
    }
}

function handleNodeSelection(clientX, clientY) {
    // Convert to normalized device coordinates
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodes);

    console.log('Selection attempt:', intersects.length, 'nodes found'); // Debug

    // Reset previous selection
    if (selectedNode) {
        selectedNode.material.emissiveIntensity = 0.3;
        selectedNode.scale.set(
            selectedNode.userData.originalScale,
            selectedNode.userData.originalScale,
            selectedNode.userData.originalScale
        );
    }

    if (intersects.length > 0) {
        selectedNode = intersects[0].object;
        selectedNode.material.emissiveIntensity = 0.8;
        const scale = 1.4;
        selectedNode.scale.set(scale, scale, scale);
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        displayNodeInfo(selectedNode.userData);
        
        // Ensure info panel is visible
        const infoPanel = document.getElementById('info-panel');
        infoPanel.style.display = 'block';
        infoPanel.style.opacity = '1';
        
        console.log('Node selected:', selectedNode.userData.label); // Debug
    } else {
        console.log('No node selected at this position'); // Debug
    }
}

function displayNodeInfo(data) {
    const infoPanel = document.getElementById('info-panel');
    const nodeInfo = document.getElementById('node-info');
    
    let html = `
        <div style="margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="color: #667eea; font-weight: bold; font-size: 1.1em; margin-bottom: 5px;">${data.label}</div>
            <div style="color: #aaa; font-size: 0.85em;">${data.type}</div>
        </div>
    `;

    if (data.source_doc) {
        html += `
            <div style="margin-bottom: 10px;">
                <strong style="color: #fff;">Source:</strong>
                <div style="color: #ccc; margin-top: 3px; font-size: 0.9em;">${data.source_doc}</div>
            </div>
        `;
    }

    if (data.properties && Object.keys(data.properties).length > 0) {
        html += '<div style="margin-top: 12px;"><strong style="color: #fff;">Properties:</strong></div>';
        
        for (const [key, value] of Object.entries(data.properties)) {
            if (value !== null && value !== undefined && value !== '') {
                let displayValue = value;
                
                // Handle different value types
                if (Array.isArray(value)) {
                    displayValue = value.join(', ');
                } else if (typeof value === 'object') {
                    displayValue = JSON.stringify(value);
                } else if (typeof value === 'string' && value.length > 150) {
                    displayValue = value.substring(0, 150) + '...';
                }
                
                html += `
                    <div class="property">
                        <strong style="color: #4ecdc4;">${key}:</strong>
                        <div style="color: #ddd; margin-top: 3px; word-wrap: break-word;">${displayValue}</div>
                    </div>
                `;
            }
        }
    }

    nodeInfo.innerHTML = html;
    
    // Auto-scroll to top of info panel
    infoPanel.scrollTop = 0;
    
    // Add close button for mobile
    if (isMobile && !document.getElementById('close-info-btn')) {
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-info-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1.2em;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
        `;
        closeBtn.onclick = () => {
            infoPanel.style.opacity = '0';
            setTimeout(() => {
                infoPanel.style.display = 'none';
                if (selectedNode) {
                    selectedNode.material.emissiveIntensity = 0.3;
                    selectedNode.scale.set(1, 1, 1);
                    selectedNode = null;
                }
            }, 300);
        };
        infoPanel.insertBefore(closeBtn, infoPanel.firstChild);
    }
}

function renderAR(timestamp, frame) {
    if (frame) {
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((referenceSpace) => {
                session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                    hitTestSource = source;
                });
            });

            session.addEventListener('end', () => {
                hitTestSourceRequested = false;
                hitTestSource = null;
            });

            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            if (hitTestResults.length && !graphGroup.visible) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
            } else {
                reticle.visible = false;
            }
        }

        if (graphGroup.visible) {
            graphGroup.rotation.y += 0.002;
        }
    }

    renderer.render(scene, camera);
}

function animate3D() {
    requestAnimationFrame(animate3D);

    nodes.forEach(node => {
        node.rotation.x += 0.001;
        node.rotation.y += 0.001;
    });

    renderer.render(scene, camera);
}

function showUI() {
    document.getElementById('info-panel').style.display = 'none'; // Start hidden
    document.getElementById('stats').style.display = 'block';
    document.getElementById('controls').style.display = 'flex';
    
    if (currentMode === '3d' && window.innerWidth > 768) {
        document.querySelector('.legend').style.display = 'block';
    }
    
    // Set initial info text
    document.getElementById('node-info').innerHTML = isMobile ? 
        '<div style="color: #aaa; text-align: center; padding: 20px;">👆 Tap any node to view details</div>' :
        '<div style="color: #aaa;">Click on a node to see details</div>';
}

window.resetView = function() {
    if (currentMode === '3d') {
        camera.position.set(0, 0, isMobile ? 40 : 30);
        graphGroup.rotation.set(0, 0, 0);
    }
    
    if (selectedNode) {
        selectedNode.material.emissiveIntensity = 0.3;
        selectedNode.scale.set(1, 1, 1);
        selectedNode = null;
    }
    
    document.getElementById('info-panel').style.display = 'none';
    document.getElementById('node-info').innerHTML = isMobile ? 
        '<div style="color: #aaa; text-align: center; padding: 20px;">👆 Tap any node to view details</div>' :
        '<div style="color: #aaa;">Click on a node to see details</div>';
};

window.zoomIn = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.max(10, camera.position.z - 5);
    } else if (currentMode === 'ar') {
        graphGroup.scale.multiplyScalar(1.2);
    }
};

window.zoomOut = function() {
    if (currentMode === '3d') {
        camera.position.z = Math.min(100, camera.position.z + 5);
    } else if (currentMode === 'ar') {
        graphGroup.scale.multiplyScalar(0.8);
    }
};

window.exitMode = function() {
    location.reload();
};

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
