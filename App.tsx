import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Desktop } from './components/Desktop';
import { Dock } from './components/Taskbar';
import { Window } from './components/Window';
import { Launchpad } from './components/Launchpad';
import { MenuBar } from './components/MenuBar';
import { Shelf } from './components/Shelf';
import { APPS } from './config/apps';
import type { WindowInstance, AppDefinition, OSAction, WindowPair, ShelfItem } from './types';
import { useSettings } from './context/SettingsContext';
import { LoginScreen } from './components/LoginScreen';
import { v4 as uuidv4 } from 'uuid';

const App: React.FC = () => {
    const { wallpaper, currentUser, theme, focusMode } = useSettings();
    const [windows, setWindows] = useState<WindowInstance[]>([]);
    const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
    const [nextZIndex, setNextZIndex] = useState<number>(10);
    const [launchpadOpen, setLaunchpadOpen] = useState<boolean>(false);
    const [nextWindowId, setNextWindowId] = useState<number>(0);
    const [fullScreenWindowId, setFullScreenWindowId] = useState<string | null>(null);
    const [isOsChromeVisible, setIsOsChromeVisible] = useState(false);
    
    // --- New Multitasking State ---
    const [windowPairs, setWindowPairs] = useState<WindowPair[]>([]);
    const [pairingWindowId, setPairingWindowId] = useState<string | null>(null);
    const [shelfItems, setShelfItems] = useState<ShelfItem[]>([]);

    useEffect(() => {
        document.body.style.backgroundImage = `url(${wallpaper})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.transition = 'background-image 0.5s ease-in-out';
    }, [wallpaper]);

    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--accent-color', theme.accentColor);
        
        if (theme.mode === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const activeApp = useMemo(() => {
        const activeId = fullScreenWindowId || activeWindowId;
        if (!activeId) return null;
        const activeWin = windows.find(win => win.id === activeId);
        return activeWin ? APPS.find(app => app.id === activeWin.appId) : null;
    }, [activeWindowId, windows, fullScreenWindowId]);

    const focusWindow = useCallback((id: string) => {
        if (id === activeWindowId && !launchpadOpen) return;
        
        setPairingWindowId(null);
        setLaunchpadOpen(false);
        setActiveWindowId(id);
        setWindows(prevWindows =>
            prevWindows.map(win =>
                win.id === id ? { ...win, zIndex: nextZIndex } : win
            )
        );
        setNextZIndex(prevZ => prevZ + 1);
    }, [activeWindowId, nextZIndex, launchpadOpen]);

    const toggleMinimize = useCallback((id: string) => {
        const pair = windowPairs.find(p => p.includes(id));
        const idsToToggle = pair || [id];
        
        const isMinimizing = windows.find(w => w.id === id)?.isMinimized === false;

        setWindows(prev => {
            let wins = [...prev];
            idsToToggle.forEach(winId => {
                const windowToToggle = wins.find(win => win.id === winId);
                if (!windowToToggle) return;
                
                if (windowToToggle.isFullScreen) {
                    setFullScreenWindowId(null);
                }

                if (windowToToggle.isMinimized) {
                    focusWindow(winId);
                }

                wins = wins.map(win =>
                    win.id === winId ? { ...win, isMinimized: !win.isMinimized, isFullScreen: false } : win
                );
            });
            return wins;
        });
        
        if (isMinimizing && (idsToToggle.includes(activeWindowId ?? ''))) {
             const remainingWindows = windows.filter(w => !idsToToggle.includes(w.id) && !w.isMinimized);
             if (remainingWindows.length > 0) {
                const topWindow = remainingWindows.reduce((prev, current) => (prev.zIndex > current.zIndex) ? prev : current);
                setActiveWindowId(topWindow.id);
             } else {
                setActiveWindowId(null);
             }
        }
    }, [windows, activeWindowId, focusWindow, windowPairs]);

    const openApp = useCallback((app: AppDefinition, filePath?: string) => {
        setLaunchpadOpen(false);

        const existingWindow = windows.find(win => win.appId === app.id && !app.allowMultiInstance);
        if (existingWindow) {
            if (existingWindow.isMinimized) {
                toggleMinimize(existingWindow.id);
            } else {
                focusWindow(existingWindow.id);
            }
            if (filePath) {
                setWindows(prev => prev.map(win => win.id === existingWindow.id ? { ...win, filePath } : win));
            }
            return;
        }
        
        const openWindowsCount = windows.filter(win => !win.isMinimized).length;
        const staggerOffset = 25 * (openWindowsCount % 10);
        const defaultWidth = app.defaultSize?.width ?? 720;
        const defaultHeight = app.defaultSize?.height ?? 540;
        const menuBarHeight = 28; // h-7 in Tailwind

        const newWindow: WindowInstance = {
            id: `win-${nextWindowId}`,
            appId: app.id,
            title: app.name,
            x: window.innerWidth / 2 - defaultWidth / 2 + staggerOffset,
            y: Math.max(menuBarHeight + 10, ((window.innerHeight - defaultHeight) / 2) - 40 + staggerOffset),
            width: defaultWidth,
            height: defaultHeight,
            zIndex: nextZIndex,
            isMinimized: false,
            isMaximized: false,
            isFullScreen: false,
            component: app.component,
            icon: app.icon,
            filePath,
        };
        setWindows(prev => [...prev, newWindow]);
        setActiveWindowId(newWindow.id);
        setNextZIndex(prev => prev + 1);
        setNextWindowId(prev => prev + 1);
    }, [nextZIndex, nextWindowId, windows, focusWindow, toggleMinimize]);
    
    const closeWindow = useCallback((id: string) => {
        const pair = windowPairs.find(p => p.includes(id));
        const idsToClose = pair || [id];

        if(idsToClose.some(winId => winId === fullScreenWindowId)) {
            setFullScreenWindowId(null);
        }
        
        setWindows(prev => prev.filter(win => !idsToClose.includes(win.id)));
        setWindowPairs(prev => prev.filter(p => !p.includes(id)));

        if (idsToClose.includes(activeWindowId ?? '')) {
             const remainingWindows = windows.filter(win => !idsToClose.includes(win.id) && !win.isMinimized);
             if (remainingWindows.length > 0) {
                const topWindow = remainingWindows.reduce((prev, current) => (prev.zIndex > current.zIndex) ? prev : current);
                setActiveWindowId(topWindow.id);
             } else {
                setActiveWindowId(null);
             }
        }
    }, [activeWindowId, windows, fullScreenWindowId, windowPairs]);

    const toggleFullScreen = useCallback((id: string) => {
        setWindows(prev =>
            prev.map(win => {
                if (win.id !== id) return win;
                if (win.isFullScreen) {
                    setFullScreenWindowId(null);
                    return { ...win, isFullScreen: false, ...win.preMaximizedState };
                } else {
                    setFullScreenWindowId(id);
                    return {
                        ...win,
                        isFullScreen: true,
                        preMaximizedState: win.isMaximized ? win.preMaximizedState : { x: win.x, y: win.y, width: win.width, height: win.height },
                    };
                }
            })
        );
        focusWindow(id);
    }, [focusWindow]);
    
    const toggleMaximize = useCallback((id: string) => {
        setWindows(prev =>
            prev.map(win => {
                if (win.id !== id) return win;
                if (win.isMaximized) {
                    return {
                        ...win, isMaximized: false,
                        x: win.preMaximizedState?.x ?? win.x, y: win.preMaximizedState?.y ?? win.y,
                        width: win.preMaximizedState?.width ?? win.width, height: win.preMaximizedState?.height ?? win.height,
                    };
                } else {
                    return { ...win, isMaximized: true, preMaximizedState: { x: win.x, y: win.y, width: win.width, height: win.height } };
                }
            })
        );
        focusWindow(id);
    }, [focusWindow]);

    const updateWindowPosition = useCallback((id: string, newX: number, newY: number) => {
        const pair = windowPairs.find(p => p.includes(id));
        const mover = windows.find(w => w.id === id);
        if (!mover) return;

        const deltaX = newX - mover.x;
        const deltaY = newY - mover.y;
        
        const idsToMove = pair || [id];

        setWindows(prev =>
            prev.map(win => {
                if (idsToMove.includes(win.id)) {
                    return { ...win, x: win.x + deltaX, y: win.y + deltaY };
                }
                return win;
            })
        );
    }, [windows, windowPairs]);

    const updateWindowSize = useCallback((id: string, newWidth: number, newHeight: number) => {
        setWindows(prev =>
            prev.map(win =>
                win.id === id ? { ...win, width: newWidth, height: newHeight } : win
            )
        );
    }, []);

    const handleExecuteAction = useCallback((action: OSAction) => {
        if (!action || !action.action) return;
        switch (action.action) {
            case 'open_app':
                if (action.payload.appId) {
                    const appToOpen = APPS.find(app => app.id === action.payload.appId);
                    if (appToOpen) openApp(appToOpen, action.payload.filePath);
                }
                break;
            default:
                console.warn(`Unknown OS action: ${action.action}`);
        }
    }, [openApp]);

    // --- App Pairing Logic ---
    const startPairing = useCallback((id: string) => {
        const existingPair = windowPairs.find(p => p.includes(id));
        if (existingPair) {
            setWindowPairs(prev => prev.filter(p => p !== existingPair));
        } else {
            setPairingWindowId(id);
        }
    }, [windowPairs]);

    const completePairing = useCallback((targetId: string) => {
        if (pairingWindowId && pairingWindowId !== targetId) {
            const existingPair = windowPairs.find(p => p.includes(pairingWindowId));
            if (existingPair) {
                setWindowPairs(prev => prev.map(p => p === existingPair ? [...p, targetId] : p));
            } else {
                setWindowPairs(prev => [...prev, [pairingWindowId, targetId]]);
            }
        }
        setPairingWindowId(null);
    }, [pairingWindowId, windowPairs]);

    // --- Shelf Logic ---
    const addToShelf = (item: Omit<ShelfItem, 'id'>) => {
        setShelfItems(prev => [...prev, { ...item, id: uuidv4() }]);
    };
    const removeFromShelf = (id: string) => {
        setShelfItems(prev => prev.filter(item => item.id !== id));
    };

    if (!currentUser) {
        return <LoginScreen />;
    }
    
    const fullScreenInstance = windows.find(w => w.id === fullScreenWindowId);
    
    const osClasses = [
        theme.mode,
        theme.glassmorphism ? 'glassmorphism' : ''
    ].join(' ');


    if (fullScreenInstance) {
        return (
            <div className={`w-screen h-screen overflow-hidden font-sans relative ${osClasses}`} onMouseLeave={() => setIsOsChromeVisible(false)}>
                <div className="absolute top-0 left-0 right-0 h-1 z-[3001]" onMouseEnter={() => setIsOsChromeVisible(true)} />
                <div className="absolute bottom-0 left-0 right-0 h-1 z-[3001]" onMouseEnter={() => setIsOsChromeVisible(true)} />

                <MenuBar activeAppName={activeApp?.name ?? "Finder"} isFullScreenMode={true} isVisible={isOsChromeVisible}/>
                <main onMouseEnter={() => setIsOsChromeVisible(false)}>
                    <Window
                        key={fullScreenInstance.id}
                        instance={fullScreenInstance}
                        onClose={closeWindow} onMinimize={toggleMinimize} onMaximize={toggleMaximize} onToggleFullScreen={toggleFullScreen}
                        onFocus={focusWindow} onPositionChange={updateWindowPosition} onSizeChange={updateWindowSize}
                        isActive={true} onExecuteAction={handleExecuteAction}
                        isPaired={false} isPairing={false} onStartPairing={() => {}} onCompletePairing={() => {}}
                    />
                </main>
                <Dock
                    windows={windows} onToggleMinimize={toggleMinimize} onFocus={focusWindow} onLaunchpadClick={() => {}}
                    activeWindowId={fullScreenInstance.id} onOpenApp={openApp} onCloseApp={closeWindow}
                    isFullScreenMode={true} isVisible={isOsChromeVisible}
                />
            </div>
        )
    }

    return (
        <div className={`w-screen h-screen overflow-hidden font-sans ${osClasses}`}>
            <MenuBar activeAppName={activeApp?.name ?? "Finder"} />
            <Desktop onOpenApp={openApp} />
             <Launchpad
                isOpen={launchpadOpen}
                onOpenApp={openApp}
                onClose={() => setLaunchpadOpen(false)}
            />
            <main onClick={() => pairingWindowId && setPairingWindowId(null)}>
                {windows.filter(w => !w.isMinimized).map(win => (
                    <Window
                        key={win.id}
                        instance={win}
                        onClose={closeWindow} onMinimize={toggleMinimize} onMaximize={toggleMaximize} onToggleFullScreen={toggleFullScreen}
                        onFocus={focusWindow} onPositionChange={updateWindowPosition} onSizeChange={updateWindowSize}
                        isActive={win.id === activeWindowId} onExecuteAction={handleExecuteAction}
                        isPaired={windowPairs.some(p => p.includes(win.id))}
                        isPairing={pairingWindowId === win.id}
                        onStartPairing={startPairing}
                        onCompletePairing={completePairing}
                    />
                ))}
            </main>
            <Dock
                windows={windows} onToggleMinimize={toggleMinimize} onFocus={focusWindow}
                onLaunchpadClick={() => setLaunchpadOpen(prev => !prev)} activeWindowId={activeWindowId}
                onOpenApp={openApp} onCloseApp={closeWindow}
            />
            <Shelf items={shelfItems} onRemoveItem={removeFromShelf} />
        </div>
    );
};

export default App;
