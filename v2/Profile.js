class Profile {
    #id = 0;
    #name = "";
    #availableUsers = [];

    setId(id_) {
        if (typeof id_ !== 'number' || id_ < 0) {
            throw new TypeError("id must be a non-negative number");
        }
        this.#id = id_;
    }

    setName(name_) {
        if (typeof name_ !== 'string' || name_.trim() === "") {
            throw new TypeError("name must be a non-empty string");
        }
        this.#name = name_.trim();
    }

    setAvailableUsers(availableUsers_) {
        if (!Array.isArray(availableUsers_)) {
            throw new TypeError("availableUsers must be an array");
        }
        this.#availableUsers = availableUsers_.filter((username) => username !== this.#name);
    }

    isValidProfile() {
        return this.id() > 0 && this.name().length > 0;
    }

    id() {
        return this.#id;
    }

    name() {
        return this.#name;
    }

    availableUsers() {
        return [...this.#availableUsers];
    }
}

export default Profile;
