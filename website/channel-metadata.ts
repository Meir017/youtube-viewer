import type { ChannelDetails } from '../generator/types';
import type { ChannelsStore } from './store';
import type { Collection, StoredChannel } from './video-enrichment';

export type PublicChannelDetails = Pick<ChannelDetails, 'title' | 'description' | 'avatar'>;

export type PublicStoredChannel = Omit<StoredChannel, 'data'> & {
    data?: Omit<NonNullable<StoredChannel['data']>, 'channel'> & {
        channel: PublicChannelDetails;
    };
};

export type PublicCollection = Omit<Collection, 'channels'> & {
    channels: PublicStoredChannel[];
};

export type PublicChannelsStore = Omit<ChannelsStore, 'collections' | 'channels'> & {
    collections: PublicCollection[];
    channels?: PublicStoredChannel[];
};

export function stripChannelMetadata(channel: ChannelDetails): PublicChannelDetails {
    return {
        title: channel.title,
        description: channel.description,
        avatar: channel.avatar,
    };
}

export function stripStoredChannel(channel: StoredChannel): PublicStoredChannel {
    return {
        ...channel,
        data: channel.data ? {
            ...channel.data,
            channel: stripChannelMetadata(channel.data.channel),
        } : channel.data,
    };
}

function stripCollection(collection: Collection): PublicCollection {
    return {
        ...collection,
        channels: collection.channels.map(stripStoredChannel),
    };
}

export function stripChannelsStore(store: ChannelsStore): PublicChannelsStore {
    const strippedStore: PublicChannelsStore = {
        ...store,
        collections: store.collections.map(stripCollection),
    };

    if (store.channels) {
        strippedStore.channels = store.channels.map(stripStoredChannel);
    }

    return strippedStore;
}
