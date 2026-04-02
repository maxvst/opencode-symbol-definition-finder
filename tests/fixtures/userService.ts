interface User {
  id: number;
  name: string;
  email: string;
}

class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  findUserById(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  async fetchUserData(url: string): Promise<User[]> {
    const response = await fetch(url);
    return response.json();
  }
}

function processUsers(users: User[]): number {
  return users.filter(u => u.email.includes('@')).length;
}

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export { UserService, processUsers, validateEmail };
export type { User };
