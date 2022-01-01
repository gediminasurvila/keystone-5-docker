require("dotenv").config();
const { Keystone } = require("@keystonejs/keystone");
const { PasswordAuthStrategy } = require("@keystonejs/auth-password");
const {
  Text,
  Checkbox,
  Password,
  Relationship,
} = require("@keystonejs/fields");
const { Content } = require("@keystonejs/fields-content");
const { GraphQLApp } = require("@keystonejs/app-graphql");
const { AdminUIApp } = require("@keystonejs/app-admin-ui");
const { StaticApp } = require("@keystonejs/app-static");
const initialiseData = require("./initial-data");

const expressSession = require("express-session");
const MongoStore = require("connect-mongodb-session")(expressSession);

const { MongooseAdapter: Adapter } = require("@keystonejs/adapter-mongoose");
const PROJECT_NAME = process.env.PROJECT_NAME;
const adapterConfig = { mongoUri: process.env.MONGO_URL };

const { LocalFileAdapter } = require("@keystonejs/file-adapters");
const { File } = require("@keystonejs/fields");

const fileAdapter = new LocalFileAdapter({
  src: "./public",
  path: "/uploads",
});

const keystone = new Keystone({
  cookie: { secure: false },
  adapter: new Adapter(adapterConfig),
  onConnect: process.env.CREATE_TABLES !== "true" && initialiseData,
  cookieSecret: process.env.COOKIE_SECRET,
  sessionStore: new MongoStore({
    uri: process.env.MONGO_URL,
    collection: "mySessions",
  }),
});

// Access control functions
const userIsAdmin = ({ authentication: { item: user } }) =>
  Boolean(user && user.isAdmin);
const userOwnsItem = ({ authentication: { item: user } }) => {
  if (!user) {
    return false;
  }

  // Instead of a boolean, you can return a GraphQL query:
  // https://www.keystonejs.com/api/access-control#graphqlwhere
  return { id: user.id };
};

const userIsAdminOrOwner = (auth) => {
  const isAdmin = access.userIsAdmin(auth);
  const isOwner = access.userOwnsItem(auth);
  return isAdmin ? isAdmin : isOwner;
};

const access = { userIsAdmin, userOwnsItem, userIsAdminOrOwner };

keystone.createList("User", {
  fields: {
    name: { type: Text },
    email: {
      type: Text,
      isUnique: true,
    },
    isAdmin: {
      type: Checkbox,
      // Field-level access controls
      // Here, we set more restrictive field access so a non-admin cannot make themselves admin.
      access: {
        update: access.userIsAdmin,
      },
    },
    password: {
      type: Password,
    },
  },
  // List-level access controls
  access: {
    read: access.userIsAdminOrOwner,
    update: access.userIsAdminOrOwner,
    create: access.userIsAdmin,
    delete: access.userIsAdmin,
    auth: true,
  },
});

keystone.createList("Post", {
  fields: {
    title: { type: Text },
    body: {
      type: Content,
      blocks: [
        Content.blocks.blockquote,
        //  Content.blocks.image,
        Content.blocks.link,
        Content.blocks.orderedList,
        Content.blocks.unorderedList,
        Content.blocks.heading,
      ],
    },
    images: {
      type: Relationship,
      ref: "Image",
    },
    author: {
      type: Relationship,
      ref: "User",
    },
  },
});

keystone.createList("Image", {
  fields: {
    file: {
      type: File,
      adapter: fileAdapter,
      hooks: {
        beforeChange: async ({ existingItem }) => {
          if (existingItem && existingItem.file) {
            await fileAdapter.delete(existingItem.file);
          }
        },
      },
    },
    altText: { type: Text },
  },
  hooks: {
    afterDelete: async ({ existingItem }) => {
      if (existingItem.file) {
        await fileAdapter.delete(existingItem.file);
      }
    },
  },
});

const authStrategy = keystone.createAuthStrategy({
  type: PasswordAuthStrategy,
  list: "User",
  config: { protectIdentities: process.env.NODE_ENV === "production" },
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new AdminUIApp({
      name: PROJECT_NAME,
      enableDefaultRoute: true,
      authStrategy,
    }),
    new StaticApp({
      path: "/uploads",
      src: "public",
    }),
  ],
};