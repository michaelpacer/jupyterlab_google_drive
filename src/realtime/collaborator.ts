// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Signal, ISignal
} from '@phosphor/signaling';

import {
  JSONObject
} from '@phosphor/coreutils';

import {
  IRealtime, IRealtimeHandler, IRealtimeModel,
  ICollaborator, IRealtimeConverter
} from 'jupyterlab/lib/common/realtime';

import {
  IObservableMap, ObservableMap
} from 'jupyterlab/lib/common/observablemap';

declare let gapi : any;

export
class CollaboratorMap implements IObservableMap<GoogleRealtimeCollaborator> {

  constructor(doc: gapi.drive.realtime.Document) {
    this._ready = new Promise<void>((resolve,reject)=>{
      //Get the map with the collaborators, or
      //create it if it does not exist.
      let id = 'collaborators:map';
      this._doc = doc;
      this._map = doc.getModel().getRoot().get(id);

      //We need to create the map
      if(!this._map) {
        this._map = doc.getModel().createMap<GoogleRealtimeCollaborator>();
        doc.getModel().getRoot().set(id, this._map);
      }

      //Populate the map with its initial values.
      //Even if the map already exists, it is easy to miss
      //some collaborator events (if, for instance, the
      //realtime doc is not shut down properly).
      //This is an opportunity to refresh it.
      let initialCollaborators: any[] = doc.getCollaborators();

      //remove stale collaborators
      let initialSessions = new Set<string>();
      for(let i=0; i<initialCollaborators.length; i++) {
        initialSessions.add(initialCollaborators[i].sessionId);
      }
      for(let k of this._map.keys()) {
        if(!initialSessions.has(k)) {
          this._map.delete(k);
        }
      }
      //Now add the remaining collaborators
      for(let i=0; i<initialCollaborators.length; i++) {
        let collaborator: GoogleRealtimeCollaborator = {
          userId: initialCollaborators[i].userId,
          sessionId: initialCollaborators[i].sessionId,
          displayName: initialCollaborators[i].displayName,
          color: initialCollaborators[i].color
        }
        if(!this._map.has(collaborator.sessionId)) {
          this._map.set(collaborator.sessionId, collaborator);
          if(initialCollaborators[i].isMe) {
            this._localCollaborator = collaborator;
          }
        } 
      }

      //Add event listeners to the CollaboratorMap
      this._doc.addEventListener(
        gapi.drive.realtime.EventType.COLLABORATOR_JOINED,
        (evt : any) => {
          let collaborator: GoogleRealtimeCollaborator = {
            userId: evt.collaborator.userId,
            sessionId: evt.collaborator.sessionId,
            displayName: evt.collaborator.displayName,
            color: evt.collaborator.color
          }
          this.set(collaborator.sessionId, collaborator);
          if(evt.collaborator.isMe) {
            this._localCollaborator = collaborator;
          }
        }
      );
      this._doc.addEventListener(
        gapi.drive.realtime.EventType.COLLABORATOR_LEFT,
        (evt : any) => {
          this.delete(evt.collaborator.sessionId);
        }
      );

      this._map.addEventListener(
        gapi.drive.realtime.EventType.VALUE_CHANGED, (evt: any)=>{
          if(!evt.isLocal) {
            let changeType: ObservableMap.ChangeType;
            if(evt.oldValue && evt.newValue) {
              changeType = 'change';
            } else if (evt.oldValue && !evt.newValue) {
              changeType = 'remove';
            } else {
              changeType = 'add';
            }
            this._changed.emit({
              type: changeType,
              key: evt.property,
              oldValue: evt.oldValue,
              newValue: evt.newValue
            });
          }
        }
      );
      resolve(void 0);
    });
  }

  /**
   * Get whether this map can be linked to another.
   *
   * @returns `false`,
   */
  readonly isLinkable: boolean = false;

  /**
   * Get whether this map is linked to another.
   *
   * @returns `false`,
   */
  readonly isLinked: boolean = false;

  readonly converters: Map<string, IRealtimeConverter<GoogleRealtimeCollaborator>> = null;

  /**
   * The number of key-value pairs in the map.
   */
  get size(): number {
    return this._map.size;
  }

  get ready(): Promise<void> {
    return this._ready;
  }

  /**
   * A signal emitted when the map has changed.
   */
  get changed(): ISignal<CollaboratorMap, ObservableMap.IChangedArgs<GoogleRealtimeCollaborator>> {
    return this._changed;
  }


  /**
   * Whether this map has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get localCollaborator(): GoogleRealtimeCollaborator {
    return this._localCollaborator;
  }

  /**
   * Set a key-value pair in the map
   *
   * @param key - The key to set.
   *
   * @param value - The value for the key.
   *
   * @returns the old value for the key, or undefined
   *   if that did not exist.
   */
  set(key: string, value: GoogleRealtimeCollaborator): GoogleRealtimeCollaborator {
    let oldVal = this._map.get(key);
    this._map.set(key, value);
    this._changed.emit({
      type: oldVal ? 'change' : 'add',
      key: key,
      oldValue: oldVal,
      newValue: value
    });
    return oldVal;
      
  }

  /**
   * Get a value for a given key.
   *
   * @param key - the key.
   *
   * @returns the value for that key.
   */
  get(key: string): GoogleRealtimeCollaborator {
    return this._map.get(key);
  }

  /**
   * Check whether the map has a key.
   *
   * @param key - the key to check.
   *
   * @returns `true` if the map has the key, `false` otherwise.
   */
  has(key: string): boolean {
    return this._map.has(key);
  }

  /**
   * Get a list of the keys in the map.
   *
   * @returns - a list of keys.
   */
  keys(): string[] {
    return this._map.keys();
  }

  /**
   * Get a list of the values in the map.
   *
   * @returns - a list of values.
   */
  values(): GoogleRealtimeCollaborator[] {
    return this._map.values();
  }

  /**
   * Remove a key from the map
   *
   * @param key - the key to remove.
   *
   * @returns the value of the given key,
   *   or undefined if that does not exist. 
   */
  delete(key: string): GoogleRealtimeCollaborator {
    let oldVal = this._map.get(key);
    this._map.delete(key);
    this._changed.emit({
      type: 'remove',
      key: key,
      oldValue: oldVal,
      newValue: undefined
    });
    return oldVal;
  }

  /**
   * Link the map to another map.
   * Any changes to either are mirrored in the other.
   *
   * @param map: the parent map.
   */
  link(map: IObservableMap<GoogleRealtimeCollaborator>): void {
    //no-op
  }

  /**
   * Unlink the map from its parent map.
   */
  unlink(): void {
    //no-op
  }

  /**
   * Set the ObservableMap to an empty map.
   */
  clear(): void {
    this._map.clear();
  }

  /**
   * Dispose of the resources held by the map.
   */
  dispose(): void {
    if(this._isDisposed) {
      return;
    }
    Signal.clearData(this);
    this._map.removeAllEventListeners();
    this._map.clear();
    this._map = null;
    this._isDisposed = true;
  }

  private _localCollaborator: GoogleRealtimeCollaborator = null;
  private _doc : gapi.drive.realtime.Document = null;
  private _map : gapi.drive.realtime.CollaborativeMap<GoogleRealtimeCollaborator> = null;
  private _isDisposed : boolean = false;
  private _ready: Promise<void> = null;
  private _changed = new Signal<CollaboratorMap, ObservableMap.IChangedArgs<GoogleRealtimeCollaborator>>(this);
}

export
class GoogleRealtimeCollaborator implements ICollaborator {
  /**
   * A user id for the collaborator.
   * This might not be unique, if the user has more than
   * one editing session at a time.
   */
  readonly userId: string;

  /**
   * A session id, which should be unique to a
   * particular view on a collaborative model.
   */
  readonly sessionId: string;

  /**
   * A human-readable display name for a collaborator.
   */
  readonly displayName: string;

  /**
   * A color to be used to identify the collaborator in
   * UI elements.
   */
  readonly color: string;
}
